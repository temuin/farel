// Cloudflare Pages Function. Pages serves dist/ itself, so this file and its
// sibling callback.js are the only server-side pieces the site needs there.
// Set CMS_USERS, CMS_GITHUB_TOKEN (and optionally the GITHUB_OAUTH_* pair) in
// the Pages project's environment variables.
import { handleAuthGet, handleAuthPost } from '../../deploy/auth.mjs';

export const onRequestGet = ({ request, env }) => handleAuthGet(request, env);
export const onRequestPost = ({ request, env }) => handleAuthPost(request, env);
