# Offline tests of the plan: no AWS account or credentials needed. The AWS provider is mocked, so
# these check the shape of what would be built (counts, routing, settings, validation rules), not
# whether AWS accepts it. Run with:  terraform test

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

# --- Network -------------------------------------------------------------------------------------

run "defaults_build_two_azs_with_one_shared_nat_gateway" {
  command = plan

  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2
    error_message = "Expected two public and two private subnets."
  }

  assert {
    condition     = length(aws_nat_gateway.main) == 1 && length(aws_eip.nat) == 1
    error_message = "Expected a single shared NAT gateway by default."
  }

  assert {
    condition     = length(aws_route_table.private) == 1
    error_message = "With one NAT gateway there should be one private route table."
  }

  assert {
    condition     = aws_vpc.main.cidr_block == "10.0.0.0/16"
    error_message = "Unexpected VPC CIDR."
  }
}

run "subnets_are_distinct_and_inside_the_vpc" {
  command = plan

  variables {
    az_count = 3
  }

  assert {
    condition = length(distinct(concat(
      [for s in aws_subnet.public : s.cidr_block],
      [for s in aws_subnet.private : s.cidr_block],
    ))) == 6
    error_message = "Every subnet needs its own CIDR block."
  }

  assert {
    condition     = alltrue([for s in concat(aws_subnet.public, aws_subnet.private) : cidrhost(s.cidr_block, 0) != ""])
    error_message = "Subnet CIDRs must be valid."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.cidr_block == cidrsubnet("10.0.0.0/16", 4, index(aws_subnet.public[*].cidr_block, s.cidr_block))])
    error_message = "Public subnets should be the first /20 blocks."
  }

  assert {
    condition     = length(distinct([for s in aws_subnet.private : s.availability_zone])) == 3
    error_message = "Private subnets should span three zones."
  }
}

run "a_nat_gateway_per_az_when_asked" {
  command = plan

  variables {
    single_nat_gateway = false
    az_count           = 3
  }

  assert {
    condition     = length(aws_nat_gateway.main) == 3 && length(aws_route_table.private) == 3
    error_message = "Expected one NAT gateway and private route table per zone."
  }
}

run "public_subnets_route_to_the_internet_gateway_and_load_balancers_find_them" {
  command = plan

  assert {
    condition     = alltrue([for r in aws_route_table.public.route : r.cidr_block == "0.0.0.0/0"])
    error_message = "The public route table should send everything to the internet gateway."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.tags["kubernetes.io/role/elb"] == "1"])
    error_message = "Public subnets need the elb role tag so internet-facing load balancers use them."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.private : s.tags["kubernetes.io/role/internal-elb"] == "1"])
    error_message = "Private subnets need the internal-elb role tag."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.map_public_ip_on_launch == false])
    error_message = "Nothing should get a public IP just by landing in a public subnet."
  }
}

# --- Cluster -------------------------------------------------------------------------------------

run "cluster_is_private_by_default_secure_and_pinned_to_standard_support" {
  command = plan

  assert {
    condition     = aws_eks_cluster.main.access_config[0].authentication_mode == "API"
    error_message = "Use access entries only (no aws-auth ConfigMap)."
  }

  assert {
    condition     = aws_eks_cluster.main.access_config[0].bootstrap_cluster_creator_admin_permissions == true
    error_message = "Whoever applies the configuration must be able to reach the cluster."
  }

  assert {
    condition     = aws_eks_cluster.main.upgrade_policy[0].support_type == "STANDARD"
    error_message = "The cluster must never fall into paid extended support."
  }

  assert {
    condition     = contains(aws_eks_cluster.main.encryption_config[0].resources, "secrets")
    error_message = "Kubernetes secrets must be encrypted with the KMS key."
  }

  assert {
    condition     = contains(aws_eks_cluster.main.enabled_cluster_log_types, "audit")
    error_message = "Audit logging should be on."
  }

  assert {
    condition     = aws_eks_cluster.main.vpc_config[0].endpoint_private_access == true
    error_message = "Nodes should reach the API privately."
  }

  assert {
    condition     = aws_kms_key.eks_secrets.enable_key_rotation == true
    error_message = "The secrets key must rotate."
  }

  assert {
    condition     = aws_eks_cluster.main.bootstrap_self_managed_addons == false
    error_message = "Add-ons are managed explicitly."
  }
}

run "the_api_can_be_restricted_to_one_address" {
  command = plan

  variables {
    endpoint_public_access_cidrs = ["203.0.113.7/32"]
  }

  assert {
    condition     = contains(aws_eks_cluster.main.vpc_config[0].public_access_cidrs, "203.0.113.7/32")
    error_message = "The API allow-list should follow the variable."
  }
}

run "extra_admins_get_access_entries" {
  command = plan

  variables {
    cluster_admin_principal_arns = [
      "arn:aws:iam::123456789012:user/aryan",
      "arn:aws:iam::123456789012:user/avishkar",
    ]
  }

  assert {
    condition     = length(aws_eks_access_entry.admin) == 2 && length(aws_eks_access_policy_association.admin) == 2
    error_message = "Each extra admin needs an access entry and a policy."
  }
}

run "no_extra_admins_by_default" {
  command = plan

  assert {
    condition     = length(aws_eks_access_entry.admin) == 0
    error_message = "No extra admins unless asked for."
  }
}

run "metrics_server_is_installed_unless_turned_off" {
  command = plan

  assert {
    condition     = length(aws_eks_addon.metrics_server) == 1
    error_message = "metrics-server is needed by the HorizontalPodAutoscaler."
  }
}

run "metrics_server_can_be_turned_off" {
  command = plan

  variables {
    enable_metrics_server_addon = false
  }

  assert {
    condition     = length(aws_eks_addon.metrics_server) == 0
    error_message = "enable_metrics_server_addon = false should skip the add-on."
  }
}

# --- Nodes ---------------------------------------------------------------------------------------

run "nodes_are_hardened_and_sized_for_availability" {
  command = plan

  assert {
    condition     = aws_launch_template.nodes.metadata_options[0].http_tokens == "required"
    error_message = "Nodes must require IMDSv2."
  }

  assert {
    condition     = aws_launch_template.nodes.block_device_mappings[0].ebs[0].encrypted == "true"
    error_message = "Node volumes must be encrypted."
  }

  assert {
    condition     = aws_eks_node_group.main.scaling_config[0].min_size == 2 && aws_eks_node_group.main.scaling_config[0].max_size == 4
    error_message = "Expected between two and four nodes."
  }

  assert {
    condition     = aws_eks_node_group.main.capacity_type == "ON_DEMAND"
    error_message = "On-demand nodes by default."
  }

  assert {
    condition     = aws_eks_node_group.main.update_config[0].max_unavailable == 1
    error_message = "Replace one node at a time."
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.node) == 3
    error_message = "The node role needs exactly the three standard policies."
  }
}

run "spot_nodes_when_asked" {
  command = plan

  variables {
    node_capacity_type = "SPOT"
  }

  assert {
    condition     = aws_eks_node_group.main.capacity_type == "SPOT"
    error_message = "capacity_type should follow the variable."
  }
}

# --- GitHub Actions --------------------------------------------------------------------------------

run "github_deploys_use_oidc_and_are_limited_to_the_app_namespace" {
  command = plan

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1
    error_message = "The GitHub OIDC provider is created by default."
  }

  assert {
    condition     = aws_eks_access_policy_association.github_deploy.access_scope[0].type == "namespace"
    error_message = "The deploy role must be scoped to a namespace, not the whole cluster."
  }

  assert {
    condition     = contains(aws_eks_access_policy_association.github_deploy.access_scope[0].namespaces, "studaura")
    error_message = "The deploy role should be limited to the app namespace."
  }

  assert {
    condition     = endswith(aws_eks_access_policy_association.github_deploy.policy_arn, "/AmazonEKSAdminPolicy")
    error_message = "Namespace admin, not cluster admin."
  }
}

run "an_existing_github_provider_is_reused" {
  command = plan

  variables {
    create_github_oidc_provider = false
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "No second OIDC provider should be created."
  }
}

# --- Input validation ---------------------------------------------------------------------------------

run "one_zone_is_rejected" {
  command = plan

  variables {
    az_count = 1
  }

  expect_failures = [var.az_count]
}

run "four_zones_are_rejected" {
  command = plan

  variables {
    az_count = 4
  }

  expect_failures = [var.az_count]
}

run "a_bad_capacity_type_is_rejected" {
  command = plan

  variables {
    node_capacity_type = "RESERVED"
  }

  expect_failures = [var.node_capacity_type]
}

run "a_tiny_vpc_is_rejected" {
  command = plan

  variables {
    vpc_cidr = "10.0.0.0/24"
  }

  expect_failures = [var.vpc_cidr]
}

run "an_empty_api_allow_list_is_rejected" {
  command = plan

  variables {
    endpoint_public_access_cidrs = []
  }

  expect_failures = [var.endpoint_public_access_cidrs]
}
