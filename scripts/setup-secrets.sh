#!/bin/bash

# Ruinos System Secrets Management Script
# This script helps set up Cloudflare secrets for different environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    print_error "wrangler CLI is not installed. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    print_error "You are not logged in to Cloudflare. Please run:"
    echo "wrangler login"
    exit 1
fi

# Function to set secret for an environment
set_secret() {
    local env=$1
    local secret_name=$2
    local secret_value=$3
    
    if [ -z "$secret_value" ]; then
        print_warning "Skipping empty secret: $secret_name for environment: $env"
        return
    fi
    
    print_status "Setting secret $secret_name for environment: $env"
    cd server
    echo "$secret_value" | wrangler secret put "$secret_name" --env "$env"
    cd ..
}

# Function to generate a random secret
generate_secret() {
    openssl rand -base64 32
}

# Main setup function
setup_secrets() {
    local env=$1
    
    print_status "Setting up secrets for environment: $env"
    
    # Enrollment secret for generating enrollment tokens
    if [ -z "$ENROLLMENT_SECRET" ]; then
        ENROLLMENT_SECRET=$(generate_secret)
        print_status "Generated ENROLLMENT_SECRET: $ENROLLMENT_SECRET"
    fi
    set_secret "$env" "ENROLLMENT_SECRET" "$ENROLLMENT_SECRET"
    
    # JWT secret for token signing
    if [ -z "$JWT_SECRET" ]; then
        JWT_SECRET=$(generate_secret)
        print_status "Generated JWT_SECRET: $JWT_SECRET"
    fi
    set_secret "$env" "JWT_SECRET" "$JWT_SECRET"
    
    # Webhook secret for webhook verification
    if [ -z "$WEBHOOK_SECRET" ]; then
        WEBHOOK_SECRET=$(generate_secret)
        print_status "Generated WEBHOOK_SECRET: $WEBHOOK_SECRET"
    fi
    set_secret "$env" "WEBHOOK_SECRET" "$WEBHOOK_SECRET"
    
    # Database encryption key
    if [ -z "$DB_ENCRYPTION_KEY" ]; then
        DB_ENCRYPTION_KEY=$(generate_secret)
        print_status "Generated DB_ENCRYPTION_KEY: $DB_ENCRYPTION_KEY"
    fi
    set_secret "$env" "DB_ENCRYPTION_KEY" "$DB_ENCRYPTION_KEY"
    
    # Admin API key for management operations
    if [ -z "$ADMIN_API_KEY" ]; then
        ADMIN_API_KEY=$(generate_secret)
        print_status "Generated ADMIN_API_KEY: $ADMIN_API_KEY"
    fi
    set_secret "$env" "ADMIN_API_KEY" "$ADMIN_API_KEY"

    # Admin password for console login
    if [ -z "$ADMIN_PASSWORD" ]; then
        print_warning "ADMIN_PASSWORD not set. Please enter a strong password for console login:"
        read -s -p "Enter ADMIN_PASSWORD: " ADMIN_PASSWORD
        echo ""
        read -s -p "Confirm ADMIN_PASSWORD: " ADMIN_PASSWORD_CONFIRM
        echo ""
        if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
            print_error "Passwords do not match!"
            exit 1
        fi
    fi
    set_secret "$env" "ADMIN_PASSWORD" "$ADMIN_PASSWORD"

    print_status "Secrets setup completed for environment: $env"
    print_warning "Important: Save your ADMIN_PASSWORD - you'll need it to access the console!"
}

# Function to list current secrets
list_secrets() {
    local env=$1
    print_status "Listing secrets for environment: $env"
    cd server
    wrangler secret list --env "$env"
    cd ..
}

# Function to delete a secret
delete_secret() {
    local env=$1
    local secret_name=$2
    
    print_warning "Deleting secret $secret_name for environment: $env"
    cd server
    wrangler secret delete "$secret_name" --env "$env"
    cd ..
}

# Function to rotate secrets
rotate_secrets() {
    local env=$1
    
    print_status "Rotating secrets for environment: $env"
    
    # Generate new secrets
    NEW_ENROLLMENT_SECRET=$(generate_secret)
    NEW_JWT_SECRET=$(generate_secret)
    NEW_WEBHOOK_SECRET=$(generate_secret)
    NEW_DB_ENCRYPTION_KEY=$(generate_secret)
    NEW_ADMIN_API_KEY=$(generate_secret)

    print_warning "ADMIN_PASSWORD rotation requires manual input. Enter new password:"
    read -s -p "Enter new ADMIN_PASSWORD: " NEW_ADMIN_PASSWORD
    echo ""
    read -s -p "Confirm new ADMIN_PASSWORD: " NEW_ADMIN_PASSWORD_CONFIRM
    echo ""
    if [ "$NEW_ADMIN_PASSWORD" != "$NEW_ADMIN_PASSWORD_CONFIRM" ]; then
        print_error "Passwords do not match!"
        exit 1
    fi

    # Set new secrets
    set_secret "$env" "ENROLLMENT_SECRET" "$NEW_ENROLLMENT_SECRET"
    set_secret "$env" "JWT_SECRET" "$NEW_JWT_SECRET"
    set_secret "$env" "WEBHOOK_SECRET" "$NEW_WEBHOOK_SECRET"
    set_secret "$env" "DB_ENCRYPTION_KEY" "$NEW_DB_ENCRYPTION_KEY"
    set_secret "$env" "ADMIN_API_KEY" "$NEW_ADMIN_API_KEY"
    set_secret "$env" "ADMIN_PASSWORD" "$NEW_ADMIN_PASSWORD"
    
    print_status "Secrets rotation completed for environment: $env"
    print_warning "Make sure to update any external systems that use these secrets!"
}

# Function to backup secrets (for disaster recovery)
backup_secrets() {
    local env=$1
    local backup_file="secrets-backup-$env-$(date +%Y%m%d-%H%M%S).txt"
    
    print_status "Creating secrets backup for environment: $env"
    
    cat > "$backup_file" << EOF
# Ruinos System Secrets Backup - Environment: $env
# Generated on: $(date)
# WARNING: This file contains sensitive information. Store securely!

ENROLLMENT_SECRET=$ENROLLMENT_SECRET
JWT_SECRET=$JWT_SECRET
WEBHOOK_SECRET=$WEBHOOK_SECRET
DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY
ADMIN_API_KEY=$ADMIN_API_KEY
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
    
    chmod 600 "$backup_file"
    print_status "Secrets backed up to: $backup_file"
    print_warning "Store this file securely and delete it after copying to a safe location!"
}

# Main script logic
case "$1" in
    "setup")
        if [ -z "$2" ]; then
            print_error "Usage: $0 setup <environment>"
            print_error "Environments: development, test, production"
            exit 1
        fi
        setup_secrets "$2"
        ;;
    "list")
        if [ -z "$2" ]; then
            print_error "Usage: $0 list <environment>"
            exit 1
        fi
        list_secrets "$2"
        ;;
    "delete")
        if [ -z "$2" ] || [ -z "$3" ]; then
            print_error "Usage: $0 delete <environment> <secret_name>"
            exit 1
        fi
        delete_secret "$2" "$3"
        ;;
    "rotate")
        if [ -z "$2" ]; then
            print_error "Usage: $0 rotate <environment>"
            exit 1
        fi
        rotate_secrets "$2"
        ;;
    "backup")
        if [ -z "$2" ]; then
            print_error "Usage: $0 backup <environment>"
            exit 1
        fi
        backup_secrets "$2"
        ;;
    *)
        echo "Ruinos System Secrets Management"
        echo ""
        echo "Usage: $0 <command> [arguments]"
        echo ""
        echo "Commands:"
        echo "  setup <env>           Set up secrets for environment (development/test/production)"
        echo "  list <env>            List current secrets for environment"
        echo "  delete <env> <name>   Delete a specific secret"
        echo "  rotate <env>          Rotate all secrets for environment"
        echo "  backup <env>          Create a backup of current secrets"
        echo ""
        echo "Examples:"
        echo "  $0 setup production"
        echo "  $0 list test"
        echo "  $0 rotate production"
        echo ""
        exit 1
        ;;
esac