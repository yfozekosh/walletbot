.PHONY: fmt check deploy

# Format all TypeScript/JavaScript/JSON/Markdown files with Deno
fmt:
	deno fmt

# Check formatting without writing (useful for CI)
check:
	deno fmt --check

# Deploy all edge functions (pass PROJECT_REF=<ref> or set SUPABASE_PROJECT_REF)
deploy:
	./deploy.sh $(PROJECT_REF)
