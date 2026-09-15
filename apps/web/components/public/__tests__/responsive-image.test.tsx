import { getImageProps } from "next/image";
import { ResponsiveImage } from "../../../../../packages/components-library/src/responsive-image";

describe("public responsive image delivery", () => {
    it("preserves the existing positioned frame and crop without a wrapper", () => {
        const image = ResponsiveImage({
            src: "/photo.jpg",
            alt: "Portrait",
            sizes: "(max-width: 640px) 100vw, 40vw",
            objectFit: "contain",
            objectPosition: "left top",
            style: { opacity: 0.8 },
        });
        expect(image.props).toMatchObject({
            fill: true,
            quality: 75,
            style: {
                opacity: 0.8,
                objectFit: "contain",
                objectPosition: "left top",
            },
        });
        expect(image.props.children).toBeUndefined();
    });
    it("produces width variants for the browser's declared image slot", () => {
        const image = ResponsiveImage({
            src: "/photo.jpg",
            alt: "Portrait",
            sizes: "(max-width: 640px) 100vw, 320px",
        });
        const { props } = getImageProps(image.props);
        expect(props.sizes).toBe("(max-width: 640px) 100vw, 320px");
        expect(props.srcSet).toContain("w=640&q=75 640w");
        expect(props.srcSet).toContain("w=1080&q=75 1080w");
        expect(props.loading).toBe("lazy");
    });
});
