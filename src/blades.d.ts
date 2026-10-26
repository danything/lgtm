// Blades' parts are CSS files exported without the .css extension
// ("./components/*" -> "./css/layered/components/*.css"), so vite/client's `*.css` doesn't
// match them, and the side-effect imports in components fail the check
// (noUncheckedSideEffectImports). This file must stay a script (no import or
// export): in a module, the same line is read as an augmentation and ignored.
declare module "@anyblades/blades/*";
