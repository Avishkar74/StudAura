data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name         = "${var.project}-${var.environment}"
  cluster_name = local.name
  azs          = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # /20 subnets: public ones take indexes 0.., private ones 8.., whatever the az_count.
  public_subnet_cidrs  = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnet_cidrs = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 4, i + 8)]

  nat_gateway_count = var.single_nat_gateway ? 1 : var.az_count
}
