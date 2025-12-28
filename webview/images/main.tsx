import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { ImagesViewProviderMessage, ImagesViewMessage, ImageData, ImageSet } from '@/views/image';

interface State {
    currentImage: ImageData | null;
    sets: Record<string, ImageSet>;
}

const vscode = acquireVsCodeApi<State>();

function App() {
    const [currentImage, setCurrentImage] = useState<ImageData | null>(null);
    const [sets, setSets] = useState<Record<string, ImageSet>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const searchBoxRef = useRef<HTMLInputElement>(null);

    // Initialize state from vscode state
    useEffect(() => {
        const state = vscode.getState() || {
            currentImage: null,
            sets: {},
        } satisfies State;
        setCurrentImage(state.currentImage);
        setSets(state.sets);

        // Request update from provider (will send filtered sets based on config)
        vscode.postMessage({ type: 'updateSets' } satisfies ImagesViewMessage);
    }, []);

    // Handle messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent<ImagesViewProviderMessage>) => {
            const message = event.data;
            switch (message.type) {
                case 'newImage':
                    // Overwrite state with authoritative data from provider
                    setCurrentImage(message.image);
                    setSets(message.sets);
                    vscode.setState({
                        currentImage: message.image,
                        sets: message.sets,
                    });
                    break;
                case 'searchResult':
                    // if results not empty, show first
                    if (message.names.length > 0) {
                        vscode.postMessage({ type: 'searchImage', name: message.names[0] } satisfies ImagesViewMessage);
                    }
                    break;
                case 'setList':
                    // Check if current image is still valid in the new sets
                    if (currentImage) {
                        const setName = currentImage.set?.name;
                        const imageStillExists = setName && message.sets.includes(setName);
                        if (!imageStillExists) {
                            // Current image's set was removed, request a new random image
                            vscode.postMessage({ type: 'randomImage' } satisfies ImagesViewMessage);
                        }
                    } else if (message.sets.length === 0) {
                        // No sets available, clear the image display
                        setCurrentImage(null);
                    }
                    break;
                default:
                    // ignore unknown
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [currentImage]);

    const availableNames = currentImage?.set?.name && sets[currentImage.set.name]
        ? sets[currentImage.set.name].images.map(img => img.name)
        : [];

    const handlePrevious = () => {
        if (availableNames.length === 0) {
            return;
        }
        vscode.postMessage({ type: 'previousImage', current: currentImage?.name ?? '' } satisfies ImagesViewMessage);
    };

    const handleNext = () => {
        if (availableNames.length === 0) {
            return;
        }
        vscode.postMessage({ type: 'nextImage', current: currentImage?.name ?? '' } satisfies ImagesViewMessage);
    };

    const handleRandom = () => {
        vscode.postMessage({ type: 'randomImage' } satisfies ImagesViewMessage);
    };

    const handleSearch = () => {
        const q = searchQuery.trim();
        if (q) {
            vscode.postMessage({ type: 'searchImage', name: q } satisfies ImagesViewMessage);
        }
    };

    const handleSearchKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    };

    const handleSetChange = (event: Event) => {
        const name = (event.target as HTMLSelectElement).value;
        if (name) {
            vscode.postMessage({ type: 'switchSet', name } satisfies ImagesViewMessage);
        }
    };

    return (
        <div class="viewer">
            <div class="toolbar">
                <select
                    id="setSelect"
                    aria-label="Image set"
                    value={currentImage?.set.name ?? ''}
                    onChange={handleSetChange}
                >
                    {Object.keys(sets).map(setName =>
                        <option key={setName} value={setName}>
                            {setName}
                        </option>,
                    )}
                </select>
                <div class="searchbar-container">
                    <input
                        ref={searchBoxRef}
                        id="searchBox"
                        type="search"
                        placeholder="Search images..."
                        aria-label="Search images"
                        value={searchQuery}
                        onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                        onKeyDown={handleSearchKeyDown}
                    />
                    <button id="searchBtn" title="Search" onClick={handleSearch}>
                        <i class='codicon codicon-search'></i>
                    </button>
                    <button id="randomBtn" title="Random image" onClick={handleRandom}>
                        <i class='codicon codicon-sync'></i>
                    </button>
                </div>
            </div>

            <div class="image-container" role="region" aria-live="polite">
                <button id="prevBtn" class="nav" title="Previous" onClick={handlePrevious}>
                    <i class='codicon codicon-arrow-circle-left'></i>
                </button>
                <img
                    id="mainImage"
                    src={currentImage?.path ?? ''}
                    alt={currentImage?.name ?? 'No image selected'}
                />
                <button id="nextBtn" class="nav" title="Next" onClick={handleNext}>
                    <i class='codicon codicon-arrow-circle-right'></i>
                </button>
            </div>

            <div class="caption">
                <h2 id="imageTitle">{currentImage?.name ?? 'No image'}</h2>
                <p id="imageCredits">{currentImage?.credits ?? ''}</p>
            </div>
        </div>
    );
}

// Render the app
const root = document.getElementById('root');
if (root) {
    render(<App />, root);
}
