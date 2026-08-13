// Cloudflare Pages Function. Pages serves dist/ itself, so this file and its
// sibling callback.js are the only server-side pieces the site needs there.
// Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in the Pages
// project's environment variables.
import { handleAuthorize } from '../../deploy/oauth.mjs';

export const onRequestGet = ({ request, env }) => handleAuthorize(request, env);
