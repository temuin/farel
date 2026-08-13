import { handleCallback } from '../../deploy/oauth.mjs';

export const onRequestGet = ({ request, env }) => handleCallback(request, env);
