import { handleCallback } from '../../deploy/auth.mjs';

export const onRequestGet = ({ request, env }) => handleCallback(request, env);
