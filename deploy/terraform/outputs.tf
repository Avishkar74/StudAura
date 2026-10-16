output "region" {
  description = "AWS region everything was created in."
  value       = var.region
}

output "cluster_name" {
  description = "Name of the EKS cluster."
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint."
  value       = aws_eks_cluster.main.endpoint
}

output "update_kubeconfig_command" {
  description = "Run this to point kubectl and helm at the cluster."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${aws_eks_cluster.main.name}"
}

output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnets (load balancers, NAT)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnets (nodes)."
  value       = aws_subnet.private[*].id
}

output "oidc_provider_arn" {
  description = "OIDC provider of the cluster, for pod roles (IRSA) such as the ones monitoring may need."
  value       = aws_iam_openid_connect_provider.eks.arn
}

output "github_deploy_role_arn" {
  description = "Role for GitHub Actions to assume with aws-actions/configure-aws-credentials."
  value       = aws_iam_role.github_deploy.arn
}

output "app_namespace" {
  description = "Namespace the deploy role may use. Create it once: kubectl create namespace <this>."
  value       = var.app_namespace
}
