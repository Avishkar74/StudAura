# The EKS control plane, its encryption key, the identity provider for pod roles (IRSA), access for
# people, and the cluster add-ons.

# --- Secrets encryption ---------------------------------------------------------------------------

resource "aws_kms_key" "eks_secrets" {
  description             = "Encrypts Kubernetes secrets in ${local.cluster_name}"
  enable_key_rotation     = true
  deletion_window_in_days = 7
}

resource "aws_kms_alias" "eks_secrets" {
  name          = "alias/${local.cluster_name}-eks-secrets"
  target_key_id = aws_kms_key.eks_secrets.key_id
}

# --- Control plane ----------------------------------------------------------------------------------

data "aws_iam_policy_document" "eks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name               = "${local.cluster_name}-eks-cluster"
  assume_role_policy = data.aws_iam_policy_document.eks_assume.json
}

resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# Created up front so the logs have a retention period (EKS would otherwise create one that keeps
# them forever, and bills for it).
resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${local.cluster_name}/cluster"
  retention_in_days = var.cluster_log_retention_days
}

# Reviewed, accepted risks (Trivy AWS-0040 and AWS-0041): the Kubernetes API has a public endpoint so
# that kubectl on a laptop and GitHub-hosted runners (whose addresses change) can reach it. It is
# not open access: every call needs AWS IAM credentials and an EKS access entry. Narrow
# endpoint_public_access_cidrs to your own address whenever you can, or make the endpoint private
# and deploy from inside the VPC.
#trivy:ignore:AVD-AWS-0040
#trivy:ignore:AVD-AWS-0041
resource "aws_eks_cluster" "main" {
  name     = local.cluster_name
  version  = var.kubernetes_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.endpoint_public_access_cidrs
  }

  # Access entries only (no aws-auth ConfigMap). Whoever runs `terraform apply` is made cluster
  # admin so they can reach the cluster straight away.
  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  encryption_config {
    resources = ["secrets"]

    provider {
      key_arn = aws_kms_key.eks_secrets.arn
    }
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  # Stay on standard support: extended support costs six times as much per hour.
  upgrade_policy {
    support_type = "STANDARD"
  }

  # The add-ons below are managed explicitly, so don't let EKS install its own copies first.
  bootstrap_self_managed_addons = false

  depends_on = [
    aws_iam_role_policy_attachment.cluster,
    aws_cloudwatch_log_group.cluster,
  ]
}

# --- Identity provider for pod roles (IRSA) ---------------------------------------------------------

resource "aws_iam_openid_connect_provider" "eks" {
  count = var.enable_irsa ? 1 : 0

  url            = aws_eks_cluster.main.identity[0].oidc[0].issuer
  client_id_list = ["sts.amazonaws.com"]
}

# --- People ------------------------------------------------------------------------------------------

resource "aws_eks_access_entry" "admin" {
  for_each = toset(var.cluster_admin_principal_arns)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "admin" {
  for_each = toset(var.cluster_admin_principal_arns)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.admin]
}

# --- Add-ons -----------------------------------------------------------------------------------------
# Networking comes before the nodes (they cannot become Ready without it); DNS and metrics need
# nodes to run on, so they come after. Versions are left to EKS, which picks the one that matches
# the Kubernetes version.

resource "aws_eks_addon" "vpc_cni" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "vpc-cni"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "kube-proxy"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "coredns"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]
}

# The HorizontalPodAutoscaler reads CPU and memory from here.
resource "aws_eks_addon" "metrics_server" {
  count = var.enable_metrics_server_addon ? 1 : 0

  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "metrics-server"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]
}
