import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default {
  plugins: [tailwindcss, autoprefixer],
  // Fix PostCSS warning: provide 'from' option to postcss.parse
  map: false, // Disable inline source maps to prevent warning
};
