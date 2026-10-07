import type { MetadataRoute } from "next";
import { siteDescription, siteName } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: siteName,
        short_name: siteName,
        description: siteDescription,
        start_url: "/",
        display: "standalone",
        background_color: "#090d0d",
        theme_color: "#090d0d",
        lang: "en",
        categories: ["games", "entertainment"],
        icons: [
            {
                src: "/brand/mark.svg",
                sizes: "any",
                type: "image/svg+xml",
            },
            {
                src: "/brand/mark.svg",
                sizes: "any",
                type: "image/svg+xml",
            },
        ],
    };
}
