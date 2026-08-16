# Branching Strategy Rule

Before making any code changes, you MUST check if you are on the `main` or `master` branch. If you are on the principal branch and no specific branch has been created for the task, you MUST create and switch to a new branch before making any modifications. NEVER make changes directly on the main/master branch.

# Pull Request Merge Rule

You must NEVER merge a Pull Request automatically. You can create the branch, commit the code, and open the Pull Request using the GitHub CLI (`gh pr create`), but you MUST leave the PR open. Only perform a merge when the user explicitly commands you to do so (e.g., "faça merge", "pode fundir a branch", etc.).
