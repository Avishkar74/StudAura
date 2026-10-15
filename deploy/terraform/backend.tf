# Remote state in S3 with locking. The bucket is created once by ./bootstrap; its name and the
# rest of this block are supplied at init time so no account details live in Git:
#
#   terraform init -backend-config=backend.hcl        (see backend.hcl.example)
terraform {
  backend "s3" {}
}
