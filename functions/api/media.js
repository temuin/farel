// Cloudflare Pages Function backing the CMS image picker.
// Needs an R2 bucket bound as MEDIA on the Pages project, plus MEDIA_BASE_URL.
import { handleMedia } from '../../deploy/media.mjs';

export const onRequestGet = ({ request, env }) => handleMedia(request, env);
export const onRequestPost = ({ request, env }) => handleMedia(request, env);
export const onRequestDelete = ({ request, env }) => handleMedia(request, env);
