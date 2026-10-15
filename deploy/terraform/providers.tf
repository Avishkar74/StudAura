provider "aws" {
  region = var.region

  # Every resource gets these, which makes the bill and the clean-up easy to trace.
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
