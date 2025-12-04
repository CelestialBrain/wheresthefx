# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/d19135a6-8621-42d6-bb8f-78a8da7b154a

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/d19135a6-8621-42d6-bb8f-78a8da7b154a) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Supabase Edge Functions

This project uses Supabase Edge Functions for backend processing.

### AI-Powered Event Extraction

The `ai-extract-event` function uses Google's Gemini API to intelligently extract event information from Instagram captions. This helps handle:

- Filipino/English mixed content
- Complex date formats (e.g., "ika-5 ng Mayo")
- Multi-venue events
- Messy regex extraction results

#### Setting up the Gemini API Key

To enable AI extraction, you need to add your Gemini API key to Supabase secrets:

```bash
# Using Supabase CLI
supabase secrets set GEMINI_API_KEY=your_api_key_here

# Or via the Supabase Dashboard:
# 1. Go to your project settings
# 2. Navigate to Edge Functions > Secrets
# 3. Add a new secret with name: GEMINI_API_KEY
```

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Other Edge Functions

- `scrape-instagram` - Scrapes Instagram posts and extracts event information
- `validate-venue` - Validates and geocodes venue locations
- `geocode-location` - Converts addresses to coordinates
- `cleanup-old-events` - Removes expired events

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/d19135a6-8621-42d6-bb8f-78a8da7b154a) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
