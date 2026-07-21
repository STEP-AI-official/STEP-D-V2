/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve the STEP D Review OS design prototype (public/review-os.html + support.js)
  // at the site root. The real app routes (/programs, /clips, …) stay reachable.
  async redirects() {
    return [{ source: "/", destination: "/review-os.html", permanent: false }];
  },
};

export default nextConfig;
