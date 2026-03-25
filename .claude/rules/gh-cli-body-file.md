Never use `gh issue create --body-file - <<'EOF'` to pipe a heredoc to stdin -- the body silently ends up empty.

Always write the body to a temp file first:
```bash
body_file=$(mktemp)
cat > "$body_file" <<'EOF'
...body content...
EOF
gh issue create --title "..." --body-file "$body_file"
rm -f "$body_file"
```
Same pattern applies to `gh issue edit --body-file` and `gh pr create --body-file`.
