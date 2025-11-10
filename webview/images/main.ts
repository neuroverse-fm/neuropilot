import { ImagesViewProviderMessage, ImagesViewMessage } from '@/views/image';

// Acquire the vscode API provided to webviews
const vscode = acquireVsCodeApi();

(function () {
    let currentName: string | null = null;
    let availableNames: string[] = [];

    const mainImage = document.getElementById('mainImage') as HTMLImageElement;
    const imageTitle = document.getElementById('imageTitle') as HTMLHeadingElement;
    const imageCredits = document.getElementById('imageCredits') as HTMLParagraphElement;
    const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
    const randomBtn = document.getElementById('randomBtn') as HTMLButtonElement;
    const searchBtn = document.getElementById('searchBtn') as HTMLButtonElement;
    const searchBox = document.getElementById('searchBox') as HTMLInputElement;
    const setSelect = document.getElementById('setSelect') as HTMLSelectElement;

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data as ImagesViewProviderMessage;
        switch (message.type) {
            case 'newImage':
                updateImage(message.image, message.sets);
                break;
            case 'searchResult':
                updateSearchResults(message.names);
                break;
            case 'setList':
                populateSets(message.sets);
                break;
            default:
                // ignore unknown
                break;
        }
    });

    function updateImage(
        image: { name: string; path: string; credits: string; set: { name: string; description: string; }; },
        sets: Record<string, {
            description: string;
            images: Omit<typeof image, 'set'>[];
        }>,
    ) {
        currentName = image.name;

        // path should be a webview-safe uri provided by extension (string)
        mainImage.src = image.path || '';
        mainImage.alt = image.name;
        imageTitle.textContent = image.name;
        imageCredits.textContent = image.credits || '';

        // Populate set selector if needed, and set current selection
        if (setSelect.options.length === 0) {
            populateSets(Object.keys(sets));
        }
        // Update selected set to match current image
        setSelect.value = image.set.name;
    }

    function updateSearchResults(names: string[]) {
        availableNames = names;
        // if results not empty, show first
        if (names.length > 0) {
            vscode.postMessage({ type: 'searchImage', name: names[0] } as ImagesViewMessage);
        }
    }

    function populateSets(sets: string[]) {
        // keep selection if already present
        const previous = setSelect.value;
        setSelect.innerHTML = '';
        sets.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            setSelect.appendChild(opt);
        });
        if (previous && Array.from(setSelect.options).some(o => o.value === previous)) {
            setSelect.value = previous;
        }
    }

    // control handlers
    prevBtn.addEventListener('click', () => {
        if (availableNames.length === 0) {
            return; // No images available to navigate
        }
        vscode.postMessage({ type: 'previousImage', current: currentName ?? '' } as ImagesViewMessage);
    });

    nextBtn.addEventListener('click', () => {
        if (availableNames.length === 0) {
            return; // No images available to navigate
        }
        vscode.postMessage({ type: 'nextImage', current: currentName ?? '' } as ImagesViewMessage);
    });

    randomBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'randomImage' } as ImagesViewMessage);
    });

    searchBtn.addEventListener('click', () => {
        const q = searchBox.value.trim();
        if (q) {
            vscode.postMessage({ type: 'searchImage', name: q } as ImagesViewMessage);
        }
    });

    setSelect.addEventListener('change', () => {
        const name = setSelect.value;
        if (name) {
            vscode.postMessage({ type: 'switchSet', name } as ImagesViewMessage);
        }
    });
}());
