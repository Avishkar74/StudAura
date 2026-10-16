# Terraform: VPC and EKS on AWS

Builds the network and the Kubernetes cluster StudAura runs on. Nothing here deploys the app; that
is the Helm chart's job (M17).

```
                          Internet
                             │
                      ┌──────┴──────┐
                      │   Internet  │
                      │   Gateway   │
                      └──────┬──────┘
   VPC 10.0.0.0/16           │
  ┌──────────────────────────┼───────────────────────────────┐
  │  public subnets (2 AZs)  │   load balancers, NAT gateway │
  │  ┌─────────────┐   ┌─────────────┐                       │
  │  │ 10.0.0.0/20 │   │ 10.0.16.0/20│                       │
  │  └──────┬──────┘   └─────────────┘                       │
  │         │ NAT                                            │
  │  private subnets (2 AZs)                                 │
  │  ┌─────────────┐   ┌─────────────┐                       │
  │  │10.0.128.0/20│   │10.0.144.0/20│  EKS nodes (2 to 4)   │
  │  └─────────────┘   └─────────────┘  + control plane ENIs │
  └──────────────────────────────────────────────────────────┘
```

| File | What it builds |
|---|---|
| `network.tf` | VPC, internet gateway, public and private subnets in 2 or 3 zones, NAT gateway, route tables, flow logs |
| `eks.tf` | EKS cluster (secrets encrypted with a KMS key, all control-plane logs, pinned to standard support), the IAM identity provider for pod roles (IRSA), admin access entries, add-ons (VPC CNI, kube-proxy, CoreDNS, metrics-server) |
| `nodes.tf` | Managed node group: IMDSv2 only, encrypted volumes, one node replaced at a time |
| `bootstrap/` | The private, encrypted, versioned S3 bucket that holds the state. Run once first |
| `tests/` | Offline plan tests (`terraform test`): no AWS account needed |

## Before you start

- An AWS account and an IAM user or role with administrator access for the demo. Do not use the
  root user.
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) set up
  with `aws configure` (check with `aws sts get-caller-identity`).
- [Terraform](https://developer.hashicorp.com/terraform/install) 1.10 or newer, plus `kubectl`.
- Read the cost section below. **A running cluster costs money every hour, so plan to destroy it
  after the demo.**

## 1. Create the state bucket (once)

```powershell
cd deploy/terraform/bootstrap
terraform init
terraform apply
terraform output -raw backend_config      # copy this
```

## 2. Point the main configuration at it

Create `deploy/terraform/backend.hcl` (git-ignored) from the output above; `backend.hcl.example`
shows the shape.

```powershell
cd ..                                      # deploy/terraform
terraform init -backend-config=backend.hcl
```

Optionally copy `terraform.tfvars.example` to `terraform.tfvars` and change what you need. The most
useful setting is `endpoint_public_access_cidrs`, which limits who can even reach the Kubernetes API.

## 3. Build it

```powershell
terraform plan -out tfplan                 # read it before applying
terraform apply tfplan                     # roughly 15 to 20 minutes, mostly the cluster and nodes
```

If the metrics-server add-on is not offered for your region or version, set
`enable_metrics_server_addon = false` and install it with Helm instead (the autoscaler needs it).

If it stops with "unsupported Kubernetes version", list what your region offers and set
`kubernetes_version` accordingly:

```powershell
aws eks describe-cluster-versions --region ap-south-1 --query "clusterVersions[?status=='STANDARD_SUPPORT'].clusterVersion"
```

## 4. Connect

```powershell
Invoke-Expression (terraform output -raw update_kubeconfig_command)   # writes ~/.kube/config
kubectl get nodes                                     # two nodes, Ready
kubectl apply -f ../../k8s/namespace.yaml             # once
```

`terraform apply` made the identity that ran it a cluster admin. To give someone else access, add
their ARN to `cluster_admin_principal_arns` and apply again.

## 5. Deploying the app

Terraform stops at the cluster. The application is delivered by ArgoCD (see `argocd/` and
`docs/CICD.md`), so no AWS credentials or IAM role for CI are needed. The cluster-wide components
(ingress controller, monitoring, ArgoCD) are installed once with your own admin access.

## Cost

Rough on-demand estimates for ap-south-1 with the defaults. Prices change and differ by region, so
check the [AWS Pricing Calculator](https://calculator.aws/) before you rely on them.

| Item | About |
|---|---|
| EKS control plane | $0.10 an hour (~$73 a month) |
| 2 × t3.medium nodes | ~$0.09 an hour together (~$65 a month) |
| 1 NAT gateway | ~$0.05 an hour plus data (~$40 a month) |
| Load balancer, once the ingress is installed (M17) | ~$0.03 an hour (~$20 a month) |
| KMS keys, CloudWatch logs, EBS | a few dollars a month |
| **Total** | **~$0.30 an hour, ~$7 a day, ~$200 a month** |

To spend less: set `node_capacity_type = "SPOT"` (about 70% off the nodes), keep
`single_nat_gateway = true` (the default), and above all **destroy the cluster when you are not
demonstrating**. Build it the day before and destroy it right after.

## Tear it down

Anything Kubernetes created (load balancers, volumes) blocks the VPC from being deleted, so remove
the workloads first.

```powershell
helm list -A                               # uninstall each release (ingress, the app, monitoring)
kubectl get svc -A | Select-String LoadBalancer   # should show nothing
terraform destroy                           # ~10 minutes
```

Confirm in the AWS console (EC2 → Load Balancers, VPC → NAT gateways) that nothing is left. The state
bucket is protected from `destroy` on purpose and costs pennies; leave it, or empty and delete it
by hand when you are completely done.

## Design choices

- **No third-party modules.** Everything is plain resources, so every line can be read and
  explained.
- **Access entries, not `aws-auth`.** EKS's current way of granting access, managed as code.
- **Standard support pinned.** `upgrade_policy.support_type = "STANDARD"` stops AWS moving the
  cluster into extended support, which costs six times as much per hour.
- **Public API endpoint, with IAM in front.** A laptop and GitHub's runners (whose addresses change)
  need to reach it. This is the one reviewed trade-off Trivy flags (AWS-0040 and AWS-0041, annotated
  in `eks.tf`); narrow `endpoint_public_access_cidrs` to your address to tighten it.
- **Ingress through ingress-nginx** (M17) rather than the AWS Load Balancer Controller, which keeps
  this configuration free of a large IAM policy. The subnet tags work with either.
- **Native state locking** (`use_lockfile`, Terraform 1.10+) instead of a DynamoDB table.

## Checks

CI runs these on every pull request (`.github/workflows/ci.yml`, job `terraform`), and you can run
them locally without an AWS account:

```powershell
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform test
```

`.terraform.lock.hcl` pins the provider with checksums for Linux, macOS and Windows and is
committed on purpose. Update it with `terraform init -upgrade`, and add the other platforms with
`terraform providers lock -platform=linux_amd64 -platform=darwin_arm64 -platform=windows_amd64`.
