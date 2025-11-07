#!/bin/bash

# Fix all route files to use Promise<{ id: string }> pattern
files=(
    "src/app/api/admin/quizzes/[id]/grouping-runs/route.ts"
    "src/app/api/admin/quizzes/[id]/groups/regenerate/route.ts"
    "src/app/api/admin/quizzes/[id]/groups/route.ts"
    "src/app/api/admin/quizzes/[id]/groups/create/route.ts"
    "src/app/api/admin/quizzes/[id]/route.ts"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "Fixing $file"
        # Replace interface params type
        sed -i '' 's/params: { id: string }/params: Promise<{ id: string }>/g' "$file"
        # Add await params at the start of function
        sed -i '' 's/export async function \([A-Z]*\)(request: NextRequest, { params }: RouteParams) {/export async function \1(request: NextRequest, { params }: RouteParams) {\n  const { id: quizId } = await params;/g' "$file"
        # Remove old quizId assignment
        sed -i '' '/const quizId = params\.id;/d' "$file"
    fi
done

echo "Fixed all route files"