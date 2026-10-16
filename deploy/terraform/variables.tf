variable "region" {
  description = "AWS region. ap-south-1 (Mumbai) is close to India; change it to suit."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "studaura"
}

variable "environment" {
  description = "Environment label (demo, staging, prod)."
  type        = string
  default     = "demo"
}

# --- Network ---------------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block of the VPC. Split into /20 subnets."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && tonumber(split("/", var.vpc_cidr)[1]) <= 18
    error_message = "vpc_cidr must be a valid CIDR block of /18 or larger."
  }
}

variable "az_count" {
  description = "Availability zones to spread subnets and nodes across (EKS needs at least 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "single_nat_gateway" {
  description = <<-EOT
    One NAT gateway shared by all private subnets (cheaper, but an AZ outage cuts internet access
    for the others). Set to false for one per AZ.
  EOT
  type        = bool
  default     = true
}

# --- Cluster ---------------------------------------------------------------------------------

variable "kubernetes_version" {
  description = <<-EOT
    EKS Kubernetes version. Use one that is in STANDARD support (see the EKS release calendar or
    `aws eks describe-cluster-versions`). The cluster is pinned to standard support so it is never
    moved into paid extended support behind your back.
  EOT
  type        = string
  default     = "1.34"
}

variable "endpoint_public_access_cidrs" {
  description = <<-EOT
    Who may reach the Kubernetes API from the internet. The default is everyone (the API still needs
    IAM credentials). Restrict it to your own IP, e.g. ["203.0.113.7/32"], when you can.
  EOT
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.endpoint_public_access_cidrs) > 0
    error_message = "Give at least one CIDR (use 0.0.0.0/0 to allow everyone)."
  }
}

variable "cluster_log_retention_days" {
  description = "How long control-plane and VPC flow logs are kept in CloudWatch."
  type        = number
  default     = 7
}

variable "cluster_admin_principal_arns" {
  description = <<-EOT
    IAM users or roles to give cluster-admin access, in addition to whoever runs `terraform apply`
    (who always gets it). Example: ["arn:aws:iam::123456789012:user/aryan"].
  EOT
  type        = list(string)
  default     = []
}

variable "enable_metrics_server_addon" {
  description = <<-EOT
    Install the EKS metrics-server add-on, which the HorizontalPodAutoscaler needs. Set to false if
    your region or Kubernetes version does not offer it and install it with Helm instead.
  EOT
  type        = bool
  default     = true
}

# --- Nodes -----------------------------------------------------------------------------------

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_capacity_type" {
  description = "ON_DEMAND, or SPOT for about 70% less money but nodes that can be reclaimed."
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

variable "node_min_size" {
  description = "Fewest nodes. Two keeps the app available while one node is replaced."
  type        = number
  default     = 2
}

variable "node_desired_size" {
  description = "Nodes to start with. The autoscaler or HPA headroom can change it later."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Most nodes the group may have."
  type        = number
  default     = 4
}

variable "node_disk_size_gb" {
  description = "Root volume size of each node (encrypted gp3)."
  type        = number
  default     = 20
}

# --- Deploys from GitHub Actions ----------------------------------------------------------------

variable "app_namespace" {
  description = "Kubernetes namespace the application is deployed to."
  type        = string
  default     = "studaura"
}

variable "create_github_oidc_provider" {
  description = <<-EOT
    Create the account-wide IAM OIDC provider for GitHub Actions. An account can have only one, so
    set this to false if it already exists (the role below then reuses it).
  EOT
  type        = bool
  default     = true
}

variable "github_oidc_subjects" {
  description = <<-EOT
    Which GitHub Actions runs may assume the deploy role, as OIDC `sub` claims. The default allows
    only workflows running on the main branch of this repository.
  EOT
  type        = list(string)
  default     = ["repo:Avishkar74/StudAura:ref:refs/heads/main"]
}
