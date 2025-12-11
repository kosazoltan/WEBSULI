module.exports = {
    apps: [{
        name: "websuli",
        script: "./dist/index.js",
        env: {
            NODE_ENV: "production",
            PORT: 5000,
            // Admin email - users with this email get automatic admin rights on Google login
            ADMIN_EMAIL: "kosa.zoltan.ebc@gmail.com"
        },
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G'
    }]
};
