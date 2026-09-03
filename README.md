# IHIMS

IHIMS is a React + Vite human resource management system. See
[SETUP_GUIDE.md](./SETUP_GUIDE.md) for Supabase authentication and deployment
configuration.

## Source structure

```text
src/
|-- App.jsx                  # Application shell and page composition
|-- components/              # Reusable presentational components
|-- features/                # Domain-specific product features
|   `-- competency/          # Competency and AI-readiness analysis
|-- services/                # External integrations and assistant services
|-- security/                # Roles, permissions, and access checks
|-- assets/                  # Images and static imports
|-- index.css                # Global styles
`-- supabaseSchema.sql       # Optional database reference schema
```

Keep new domain behavior in `features/<feature-name>`, reusable UI in
`components`, external API clients in `services`, and authorization logic in
`security`. `App.jsx` should primarily compose these pieces.

## Commands

```bash
npm run dev
npm run lint
npm run build
```
