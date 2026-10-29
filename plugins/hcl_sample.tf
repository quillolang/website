variable "region" {
  type    = string
  default = "eu-west-1"
}

locals {
  name = "quillo-shop"
}

provider "aws" {
  region = var.region
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = var.size == "big" ? "t3.large" : "t3.small"
  count         = 2 * 1

  tags = {
    Name = "${local.name}-web"
    Env  = "production"
  }
}

resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name}-uploads"
}
