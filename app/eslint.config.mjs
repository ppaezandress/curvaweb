import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Reglas del proyecto — barreras contra regresiones que ya ocurrieron (ver AGENTS.md).
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='audio'] JSXAttribute[name.name='controls']",
          message:
            "No uses el reproductor de audio nativo (<audio controls>): se ve distinto/feo en cada navegador. Usa <VoiceBubble> (components/chat/VoiceBubble.tsx).",
        },
        {
          selector: "JSXOpeningElement[name.name='video'] JSXAttribute[name.name='controls']",
          message:
            "No uses el reproductor de video nativo (<video controls>). Usa <VideoBubble> (components/chat/VideoBubble.tsx).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
