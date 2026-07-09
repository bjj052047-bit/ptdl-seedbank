/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // eslint 패키지가 설치되어 있지 않아도 빌드가 멈추지 않도록 빌드 중 린트 검사를 건너뜁니다.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
