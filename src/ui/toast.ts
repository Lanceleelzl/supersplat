import { Container, Label } from '@playcanvas/pcui';

class Toast extends Container {
    private messageLabel: Label;
    private hideTimer: number | null = null;

    constructor(args = {}) {
        args = {
            ...args,
            id: 'toast-container',
            hidden: true
        };

        super(args);

        this.dom.tabIndex = 0;
        this.dom.setAttribute('role', 'status');
        this.dom.setAttribute('aria-live', 'polite');

        this.messageLabel = new Label({
            class: 'toast-message',
            text: ''
        });

        this.append(this.messageLabel);
    }

    show(message: string, timeoutMs = 2000) {
        this.messageLabel.text = message;
        this.hidden = false;

        // clear previous timer
        if (this.hideTimer !== null) {
            window.clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        this.hideTimer = window.setTimeout(() => {
            this.hidden = true;
            this.hideTimer = null;
        }, timeoutMs);
    }
}

export { Toast };