import * as vscode from 'vscode';
import { BaseWebviewViewProvider } from './base';

export type LoadedImageSets = Record<string, ImageData[]>; // need to figure out how to store this data

export interface ImageData {
    path: string;
    credits: string;
}

export interface ImageViewProviderMessage {
    type: 'newImage';
    image: ImageData; // Image data
}

export enum TransitionType {
    PREVIOUS,
    NEXT,
    RANDOM,
}

export interface ImageViewMessage {
    type: 'cycleImages';
    refresh: boolean;
}

export class ImageViewProvider extends BaseWebviewViewProvider<ImageViewMessage, ImageViewProviderMessage> {
    public static readonly viewType = 'neuropilot.imageView';

    constructor() {
        super('image.html', 'image.js', ['image.css']);
    }

    protected handleMessage(message: ImageViewMessage): void {
        /** @todo handle messages */
    }
};
