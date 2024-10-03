// Classe qui gère l'interface des attaques rapides avec ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class QuickAttackApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "quick-attack-app",
        classes: ["dnd5e2", "quick-attack-app"],
        tag: "div",
        position: {
            width: 800,
            height: "auto",        
        },
        window: {
            icon: "fas fa-crosshairs",
        },        

        actions: {
            rollAction: QuickAttackApp.roll,
        }
    };

    static PARTS = {
        foo: {
            template: "modules/juls-dnd-tools/templates/quick-attack-app.hbs",
        }
    };

    constructor(attackerToken, targetToken) {
        super();
        
        this.attackerToken = attackerToken;
        this.targetToken = targetToken;
        this.attackResults = [];
        this.attacks = [];

        // CA de la cible par défaut
        this.targetAC = targetToken.actor.system.attributes.ac.value ?? 10;

        if (this.attackerToken.actor?.collections?.items)
        {
            this.attackerToken.actor.collections.items.forEach(item => {                
                if (item.type === "weapon")
                {
                    this.attacks.push({
                        item: item,
                        
                    });
                }
            });
        }

        console.log(this.attackerToken.actor);
    }

    /**
     * 
     * @param {*} context 
     * @param {*} option 
     */
    _renderHTML(context, option)
    {
        context.attacker = this.attackerToken.name;
        context.target = this.targetToken.name;
        context.targetAC = this.targetAC;
        context.attacks = this.attacks;
        context.attackResults = this.attackResults;
        return super._renderHTML(context, option);
    }

    async refresh()
    {
        // Pour chaque lancé de dés, recalculer les résultats et lancer les dés de dégâts au besoin
        for (let i = 0; i < this.attackResults.length; i++) {
            this.attackResults[i].success = this.attackResults[i].roll.total >= this.targetAC;

            // Regardons le résultat du dé plus attentivement
            let dice = this.attackResults[i].rollResults[0].result;
            this.attackResults[i].rollResults.forEach(r => {
                if (this.attackResults[i].mode == 1 && r.result > dice) // avantage, on prend le plus grand
                    dice = r.result;
                else if (this.attackResults[i].mode == -1 && r.result < dice) // désavantage, on prend le plus petit
                    dice = r.result;
            });

            let critic = false;
            if (dice == 1)
                this.attackResults[i].success = false;   // échec critique
            else if (dice == 20)
            {
                this.attackResults[i].success = true;    // réussite critique            
                critic = true;
            }

            if (this.attackResults[i].active && this.attackResults[i].success && !this.attackResults[i].damage)
            {
                // On tire les dégâts pour chaque formule de dégâts
                let rolls = [];
                this.attackResults[i].damageFormula.forEach(f => {
                    let formula = f.formula;
                    // Si c'est un critique, on double le nombre de dés lancé
                    // On cherche le pattern XdY et on double X avant d'écrire la nouvelle formule
                    if (critic)
                        formula = formula.replace(/(\d+)d(\d+)/g, (match, p1, p2) => (parseInt(p1) * 2) + 'd' + p2);
                    
                    rolls.push({
                        type: f.damageType,
                        roll: new Roll(formula + '[' + f.damageType + ']'),
                    });
                });

                // Lançons les dés
                for (let j = 0; j < rolls.length; j++)
                    await rolls[j].roll.roll();

                // Montrons les jets de dé tous en même temps !
                if (game.dice3d) {
                    rolls.forEach(r => game.dice3d.showForRoll(r.roll));
                }
                
                this.attackResults[i].damage = rolls;

                this.attackResults[i].totalDamage = 0;
                this.attackResults[i].damage.forEach(d => {
                    this.attackResults[i].totalDamage += d.roll.total;
                });
            }
        }
        this.render();
    }

    /**
     * Roll prepared dice !
     * 
     * @param {*} roll 
     */
    static async roll(event, target)
    {
        const weapon = this.attackerToken.actor.collections.items.get(target.dataset.weapon);

        const roll = new Roll(target.dataset.mode + " + " + (weapon.labels.modifier ?? '0'));
        await roll.roll();
        // Si Dice So Nice est activé, afficher l'animation des dés
        if (game.dice3d) {
            game.dice3d.showForRoll(roll);  // ne pas attendre la fin de l'animation
        }

        this.attackResults.push({
            roll: roll,
            mode: target.dataset.mode == '2d20kh' ? 1 : (target.dataset.mode == '2d20kl' ? -1 : 0),
            rollResults: roll.terms[0].results,
            damageFormula: weapon.labels.damages,
            totalDamage: 0,
            damage: null,
            active: true,
            success: false,
        });

        this.refresh();
    }
}