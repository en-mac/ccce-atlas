#!/bin/bash
#
# AWS Free Tier Automated Deployment for CCCE Atlas
#
# This script creates:
# - RDS PostgreSQL instance with PostGIS
# - EC2 instance for API
# - Security groups
# - Elastic IP
#
# Cost: $0/month (within free tier limits)
# Time: ~30 minutes
#

set -e

echo "========================================="
echo "CCCE Atlas - AWS Free Tier Deployment"
echo "========================================="
echo ""

# Configuration
PROJECT_NAME="ccce-atlas"
REGION="${AWS_REGION:-us-east-1}"
# Generate valid RDS password (only alphanumeric + allowed special chars)
DB_PASSWORD="${DB_PASSWORD:-$(LC_ALL=C tr -dc 'A-Za-z0-9!#$%&()*+,-.:<=>?[]^_{|}~' < /dev/urandom | head -c 32)}"
INSTANCE_TYPE="t3.micro"
DB_INSTANCE_CLASS="db.t3.micro"

echo "Configuration:"
echo "  Region: $REGION"
echo "  Project: $PROJECT_NAME"
echo "  DB Instance: $DB_INSTANCE_CLASS"
echo "  EC2 Instance: $INSTANCE_TYPE"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first."
    exit 1
fi

# Check authentication
echo "→ Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✓ Authenticated as account: $ACCOUNT_ID"
echo ""

# Create key pair for EC2
echo "→ Creating EC2 key pair..."
KEY_NAME="${PROJECT_NAME}-key"
if aws ec2 describe-key-pairs --key-names $KEY_NAME --region $REGION &> /dev/null; then
    echo "  Key pair already exists: $KEY_NAME"
else
    aws ec2 create-key-pair \
        --key-name $KEY_NAME \
        --region $REGION \
        --query 'KeyMaterial' \
        --output text > ${KEY_NAME}.pem
    chmod 400 ${KEY_NAME}.pem
    echo "✓ Created key pair: $KEY_NAME"
    echo "  Saved to: ${KEY_NAME}.pem"
fi
echo ""

# Get default VPC
echo "→ Finding default VPC..."
VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=is-default,Values=true" \
    --region $REGION \
    --query 'Vpcs[0].VpcId' \
    --output text)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
    echo "❌ No default VPC found. Please create one first."
    exit 1
fi
echo "✓ Using VPC: $VPC_ID"
echo ""

# Create security group for RDS
echo "→ Creating RDS security group..."
RDS_SG_NAME="${PROJECT_NAME}-db-sg"
RDS_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$RDS_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --region $REGION \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ "$RDS_SG_ID" == "None" ] || [ -z "$RDS_SG_ID" ]; then
    RDS_SG_ID=$(aws ec2 create-security-group \
        --group-name $RDS_SG_NAME \
        --description "Security group for CCCE Atlas RDS" \
        --vpc-id $VPC_ID \
        --region $REGION \
        --query 'GroupId' \
        --output text)
    echo "✓ Created security group: $RDS_SG_ID"
else
    echo "  Security group already exists: $RDS_SG_ID"
fi
echo ""

# Create security group for EC2
echo "→ Creating EC2 security group..."
EC2_SG_NAME="${PROJECT_NAME}-api-sg"
EC2_SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$EC2_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --region $REGION \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ "$EC2_SG_ID" == "None" ] || [ -z "$EC2_SG_ID" ]; then
    EC2_SG_ID=$(aws ec2 create-security-group \
        --group-name $EC2_SG_NAME \
        --description "Security group for CCCE Atlas API" \
        --vpc-id $VPC_ID \
        --region $REGION \
        --query 'GroupId' \
        --output text)

    # Add SSH rule
    aws ec2 authorize-security-group-ingress \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region $REGION

    # Add HTTP rule
    aws ec2 authorize-security-group-ingress \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region $REGION

    # Add API rule
    aws ec2 authorize-security-group-ingress \
        --group-id $EC2_SG_ID \
        --protocol tcp \
        --port 8000 \
        --cidr 0.0.0.0/0 \
        --region $REGION

    echo "✓ Created security group: $EC2_SG_ID"
else
    echo "  Security group already exists: $EC2_SG_ID"
fi
echo ""

# Allow EC2 to connect to RDS
echo "→ Configuring database access..."
aws ec2 authorize-security-group-ingress \
    --group-id $RDS_SG_ID \
    --protocol tcp \
    --port 5432 \
    --source-group $EC2_SG_ID \
    --region $REGION 2>/dev/null || echo "  Rule already exists"
echo "✓ EC2 can connect to RDS"
echo ""

# Create RDS subnet group
echo "→ Creating RDS subnet group..."
SUBNET_IDS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --region $REGION \
    --query 'Subnets[*].SubnetId' \
    --output text)

DB_SUBNET_GROUP="${PROJECT_NAME}-db-subnet"
if ! aws rds describe-db-subnet-groups --db-subnet-group-name $DB_SUBNET_GROUP --region $REGION &> /dev/null; then
    aws rds create-db-subnet-group \
        --db-subnet-group-name $DB_SUBNET_GROUP \
        --db-subnet-group-description "Subnet group for CCCE Atlas" \
        --subnet-ids $SUBNET_IDS \
        --region $REGION > /dev/null
    echo "✓ Created subnet group: $DB_SUBNET_GROUP"
else
    echo "  Subnet group already exists: $DB_SUBNET_GROUP"
fi
echo ""

# Create RDS instance
echo "→ Creating RDS PostgreSQL instance..."
echo "  This will take ~10 minutes..."
DB_INSTANCE_ID="${PROJECT_NAME}-db"

if aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE_ID --region $REGION &> /dev/null; then
    echo "  RDS instance already exists: $DB_INSTANCE_ID"
    DB_STATUS=$(aws rds describe-db-instances \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text)
    echo "  Status: $DB_STATUS"
else
    aws rds create-db-instance \
        --db-instance-identifier $DB_INSTANCE_ID \
        --db-instance-class $DB_INSTANCE_CLASS \
        --engine postgres \
        --engine-version 15.17 \
        --master-username postgres \
        --master-user-password "$DB_PASSWORD" \
        --allocated-storage 20 \
        --storage-type gp2 \
        --db-subnet-group-name $DB_SUBNET_GROUP \
        --vpc-security-group-ids $RDS_SG_ID \
        --publicly-accessible \
        --backup-retention-period 7 \
        --db-name ccce_atlas \
        --region $REGION \
        --no-multi-az \
        --no-storage-encrypted > /dev/null

    echo "✓ RDS creation started"
    echo "  Waiting for RDS to be available..."
    aws rds wait db-instance-available \
        --db-instance-identifier $DB_INSTANCE_ID \
        --region $REGION
fi

# Get RDS endpoint
DB_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier $DB_INSTANCE_ID \
    --region $REGION \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text)
echo "✓ RDS available at: $DB_ENDPOINT"
echo ""

# Get latest Amazon Linux 2023 AMI
echo "→ Finding latest Amazon Linux 2023 AMI..."
AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=al2023-ami-2023.*-x86_64" \
              "Name=state,Values=available" \
    --region $REGION \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --output text)
echo "✓ Using AMI: $AMI_ID"
echo ""

# Create EC2 instance
echo "→ Creating EC2 instance..."
EC2_NAME="${PROJECT_NAME}-api"

EXISTING_INSTANCE=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$EC2_NAME" \
              "Name=instance-state-name,Values=running,pending,stopped" \
    --region $REGION \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || echo "")

if [ "$EXISTING_INSTANCE" != "None" ] && [ -n "$EXISTING_INSTANCE" ]; then
    INSTANCE_ID=$EXISTING_INSTANCE
    echo "  EC2 instance already exists: $INSTANCE_ID"
else
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --instance-type $INSTANCE_TYPE \
        --key-name $KEY_NAME \
        --security-group-ids $EC2_SG_ID \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$EC2_NAME}]" \
        --region $REGION \
        --query 'Instances[0].InstanceId' \
        --output text)

    echo "✓ Created EC2 instance: $INSTANCE_ID"
    echo "  Waiting for instance to be running..."
    aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $REGION
fi
echo ""

# Allocate Elastic IP
echo "→ Allocating Elastic IP..."
EXISTING_EIP=$(aws ec2 describe-addresses \
    --filters "Name=tag:Name,Values=$EC2_NAME-eip" \
    --region $REGION \
    --query 'Addresses[0].AllocationId' \
    --output text 2>/dev/null || echo "")

if [ "$EXISTING_EIP" != "None" ] && [ -n "$EXISTING_EIP" ]; then
    ALLOCATION_ID=$EXISTING_EIP
    echo "  Elastic IP already exists"
else
    ALLOCATION_ID=$(aws ec2 allocate-address \
        --domain vpc \
        --region $REGION \
        --query 'AllocationId' \
        --output text)

    aws ec2 create-tags \
        --resources $ALLOCATION_ID \
        --tags "Key=Name,Value=$EC2_NAME-eip" \
        --region $REGION

    echo "✓ Allocated Elastic IP"
fi

# Associate Elastic IP with instance
aws ec2 associate-address \
    --instance-id $INSTANCE_ID \
    --allocation-id $ALLOCATION_ID \
    --region $REGION > /dev/null 2>&1 || echo "  Already associated"

ELASTIC_IP=$(aws ec2 describe-addresses \
    --allocation-ids $ALLOCATION_ID \
    --region $REGION \
    --query 'Addresses[0].PublicIp' \
    --output text)

echo "✓ Elastic IP: $ELASTIC_IP"
echo ""

# Save deployment info
echo "→ Saving deployment information..."
cat > deployment-info.txt << EOF
CCCE Atlas AWS Deployment Information
Generated: $(date)

===========================================
EC2 Instance
===========================================
Instance ID: $INSTANCE_ID
Public IP: $ELASTIC_IP
Key File: ${KEY_NAME}.pem
SSH Command: ssh -i ${KEY_NAME}.pem ec2-user@$ELASTIC_IP

===========================================
RDS PostgreSQL
===========================================
Instance ID: $DB_INSTANCE_ID
Endpoint: $DB_ENDPOINT
Port: 5432
Database: ccce_atlas
Username: postgres
Password: $DB_PASSWORD

Connection String:
postgresql://postgres:$DB_PASSWORD@$DB_ENDPOINT:5432/ccce_atlas

===========================================
Security Groups
===========================================
EC2 Security Group: $EC2_SG_ID
RDS Security Group: $RDS_SG_ID

===========================================
Next Steps
===========================================
1. SSH into EC2:
   ssh -i ${KEY_NAME}.pem ec2-user@$ELASTIC_IP

2. Run setup script:
   curl -O https://raw.githubusercontent.com/en-mac/ccce-atlas/main/infra/aws/setup-ec2.sh
   bash setup-ec2.sh

3. Clone repo and deploy:
   git clone https://github.com/en-mac/ccce-atlas.git
   cd ccce-atlas/infra/aws

4. Create .env.production with the database URL above

5. Build and start:
   docker-compose -f docker-compose.prod.yml up -d

===========================================
API URL
===========================================
http://$ELASTIC_IP:8000

EOF

echo "✓ Saved to: deployment-info.txt"
echo ""

echo "========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "EC2 Instance: $ELASTIC_IP"
echo "RDS Endpoint: $DB_ENDPOINT"
echo ""
echo "Next steps:"
echo "1. SSH into EC2:"
echo "   ssh -i ${KEY_NAME}.pem ec2-user@$ELASTIC_IP"
echo ""
echo "2. Follow the instructions in deployment-info.txt"
echo ""
echo "Database password saved in deployment-info.txt"
echo ""
echo "⏱️  Total infrastructure setup time: ~15 minutes"
echo "🎉 Your API will be at: http://$ELASTIC_IP:8000"
echo ""
