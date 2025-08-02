const path = require("path");
const fs = require("fs");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    mode: process.env.NODE_ENV === "development" ? "development" : "production",
    entry: {
        popup: "./src/popup.ts",
        "service-worker": "./src/service-worker.ts",
        keywords: "./src/keywords.ts",
    },
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "dist"),
    },
    devtool: process.env.NODE_ENV === "development" ? "eval-source-map" : false,
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.html$/i,
                loader: "html-loader",
            },
        ],
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js"],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "src/popup.html", to: "popup.html" },
                { from: "src/style.css", to: "style.css" },
                { from: "icon.png", to: "icon.png" },
                { from: "manifest.json", to: "manifest.json" },
            ],
        }),
    ],
};
