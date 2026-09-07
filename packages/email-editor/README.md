# Introduction

A WYSIWYG email editor by [CourseLit](https://courselit.app).

## Installation

The project depends of TailwindCSS, so you need to have it configured on your project, before installating this package.

```sh
npm i @courselit/email-editor
```

### Importing the CSS

#### 1. Tailwind v4

In your CSS file, add

```css
@source "./node_modules/@courselit/email-editor";
# ... remaining code ...
```

#### 2. Tailwind v3

In your tailwind config, add

```js
module.exports = {
    content: [
        // ... remaining code ...
        "./node_modules/@courselit/email-editor",
    ],
    // ... remaining code ...
};
```

## Tech Stack

- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn/ui](https://ui.shadcn.com/)
- [React email](https://react.email/)

## Usage

To show the email editor

```js
import { EmailEditor } from "@courselit/email-editor";
import "@courselit/email-editor/styles.css";

export default App() {
    return (<EmailEditor  />)
}
```

Server routes that render a notification for review use the rendering entry:

```ts
import { renderEmailToHtml } from "@courselit/email-editor/render";

const html = await renderEmailToHtml({ email });
```

This entry shares the email blocks with the editor without loading its controls.
The package root remains available for browser editors and existing consumers.
Verify the boundary with the web production build; notification-rendering tests
also exercise the same renderer used by the delivery worker.
