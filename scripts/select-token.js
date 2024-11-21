// Classe qui gère l'interface des attaques rapides avec ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class SelectorTokenApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "token-selector-app",
        classes: ["dnd5e2", "dtjul-window", "dtjul-token-selector-app"],
        tag: "div",
        position: {
            width: 760,
            height: "auto",            
        },
        window: {
            icon: "fas fa-target",
        },        

        actions: {
            chooseTokenAction: SelectorTokenApp.chooseToken,
        }
    };

    static PARTS = {
        foo: {
            template: "modules/juls-dnd-tools/templates/choose-token-app.hbs",
        }
    };

    /**
     * 
     * @param {*} options 
     */
    constructor(options = {}) {
        super(options);
        
        this.tokens = [];

        switch (options.filterOption || "all")
        {
            case "players":
                this.tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.hasPlayerOwner);
                break;
            case "ennemies":
                this.tokens = canvas.tokens.placeables.filter(t => !t.actor.hasPlayerOwner && t.combatant?.initiative !== null);
            case "all":
            default:            
                this.tokens = canvas.tokens.placeables;
                break;
        }

        this.distanceToken = options.distanceToken ?? null;

        this.promise = new Promise(resolve => {
            this.resolve = resolve; // Fonction pour résoudre la promesse
          });
    }

    /**
     * 
     */
    get title()
    {
        // Fabrication du titre de la fenêtre : "Dégâts sur <noms des tokens séparés par des virgules>"
        return `Sélectionnez un token`;
    }

    /**
     * 
     * @param {*} context 
     * @param {*} option 
     */
    _renderHTML(context, option)
    {
        context.tokens = [];
        for (let token of this.tokens)
        {
            context.tokens.push({
                id: token.id,
                name: token.name,
                img: token.document.texture.src,
                actor: token.actor,
                distance: this.distanceToken ? canvas.grid.measurePath([this.distanceToken.center, token.center]).distance : null,
            });
       }

        
        return super._renderHTML(context, option);
    }

    /**
     * Transaction
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static chooseToken(event, target)
    {
        const tokenId = target.dataset.id;
        const selectedToken = canvas.tokens.get(tokenId);

        this.resolve(selectedToken); // Résout la promesse avec le token sélectionné        
        this.close();
    }

    // Méthode close pour gérer la fermeture sans sélection
    close(options) {
        if (!options?.resolved) {
        this.resolve(null); // Résout la promesse avec null si aucun token n'a été sélectionné
        }
        return super.close(options);
    }

    // Méthode statique pour utiliser la promesse
    static async selectToken(options = {}) {
        const modal = new SelectorTokenApp(options);
        modal.render(true);
        return modal.promise; // Retourne la promesse
    }
}