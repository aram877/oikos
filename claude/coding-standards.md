# Coding Standards

- Strict TypeScript
- No `any`
- Small pure functions
- Explicit error handling
- Feature-based folder structure
- No giant files >300 lines
- No business logic inside React components
- In each feature ,always have separate modular hooks, services, utils and types
- Reusable components should be in a shared folder
- No `console.log` or `debugger` statements
- No unused imports
- No unused variables
- When creating supabase migrations, also update the main schema.sql file, so that when a new project is created, it has all the tables and columns already defined.
