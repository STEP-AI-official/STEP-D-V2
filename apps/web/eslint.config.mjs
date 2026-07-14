import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".next/**", ".next-codex-build/**"]
  },
  ...nextVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-compiler/react-compiler": "off",
      "react-hooks/purity": "off",
    }
  }
];

export default eslintConfig;
