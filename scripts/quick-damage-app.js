// Classe qui gère l'interface des attaques rapides avec ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export class QuickDamageApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "quick-damage-app",
        classes: ["dnd5e2", "dtjul-window", "dtjul-quick-damage-app"],
        tag: "div",
        position: {
            width: 500,
            height: "auto",        
        },
        window: {
            icon: "fas fa-dice",
        },        

        actions: {
            changeSavingThrowAction: QuickDamageApp.changeSavingThrow,
            changeSavingThrowEffectAction: QuickDamageApp.changeSavingThrowEffect,
            changeNbAttacksAction: QuickDamageApp.changeNbAttacks,
            applyDamageAction: QuickDamageApp.applyDamage,
            missedAction: QuickDamageApp.missed,
            addDamageAction: QuickDamageApp.addDamage,
        }
    };

    static PARTS = {
        foo: {
            template: "modules/juls-dnd-tools/templates/quick-damage-app.hbs",
        }
    };

    constructor(targetTokens, defaultDamage = 'force') {
        super();
        
        this.targetTokens = targetTokens; 
        // Si on a qu'un seul token, on le transforme en tableau
        if (!Array.isArray(this.targetTokens))
            this.targetTokens = [this.targetTokens];
        
        this.defaultDamage = defaultDamage ?? 'force';       
        this.nbAttacks = 1;
        this.savingThrow = '';
        this.savingThrowDC = 10;

        // On va essayer de deviner l'attaquant...
        const c = game.combat?.combatant?.token;
        // On cherche le token de l'acteur dont c'est le tour
        if (c && c.actor.system.attributes.spelldc)
        {
            this.savingThrowDC = c.actor.system.attributes.spelldc;
        }

        this.savingThrowEffect = "half";

        // Initialisation d'un tableau qui contient une entrée pour chaque type de dommage possible dans le système DD5
        // CONFIG.DND5E.damageTypes est un objet dont les clés sont les types de dommages et les valeurs sont les traductions
        this.damages = [];

        for (let type in CONFIG.DND5E.damageTypes)
        {
            const d = CONFIG.DND5E.damageTypes[type];

            this.damages.push({
                type: type,
                label: d.label,
                img: d.icon,
                ref: d.reference,
                value: '',                
            });
        }
    }

    /**
     * 
     */
    get title()
    {
        // Fabrication du titre de la fenêtre : "Dégâts sur <noms des tokens séparés par des virgules>"
        return `Dégâts sur ${this.targetTokens.map(t => t.name).join(', ')}`;
    }

    /**
     * 
     * @param {*} context 
     * @param {*} option 
     */
    _renderHTML(context, option)
    {
        context.targets = this.targetTokens;        
        context.damages = this.damages;
        context.attention = false;
        // Si au moins une des cibles est un joueur, attention passe à vrai
        for (let t = 0; t < this.targetTokens.length; t++)
        {
            if (this.targetTokens[t].actor.hasPlayerOwner)
            {
                context.attention = true;
                break;
            }
        }

        context.st_no = this.savingThrow === '';
        context.st_str = this.savingThrow === 'str';
        context.st_dex = this.savingThrow === 'dex';
        context.st_con = this.savingThrow === 'con';
        context.st_int = this.savingThrow === 'int';
        context.st_wis = this.savingThrow === 'wis';
        context.st_cha = this.savingThrow === 'cha';
        
        context.st_no_dmg = this.savingThrowEffect === "none";
        context.st_half_dmg = this.savingThrowEffect === "half";

        context.st_dc = this.savingThrowDC;
        context.nbAttacks = this.nbAttacks;

        return super._renderHTML(context, option);
    }

    _onRender(context, options) {
        for (let type in CONFIG.DND5E.damageTypes)
            this.element.querySelector("input[name=" + type + "]").addEventListener("change", (e) => { this.changeDamage(e, e.target); });        

        let stdc = this.element.querySelector("input[name=stdc]");
        if (stdc)
            stdc.addEventListener("change", (e) => { this.changeDC(e, e.target); });        
    }

    async refresh()
    {
        this.render();
    }

    /**
     * change saving throw !
     * 
     * @param {*} roll 
     */
    static async changeSavingThrow(event, target)
    {
        this.savingThrow = target.dataset.value;
        await this.refresh();
    }

    /**
     * change saving throw effect !
     * 
     * @param {*} roll 
     */
    static async changeSavingThrowEffect(event, target)
    {
        this.savingThrowEffect = target.dataset.value;
        await this.refresh();
    }

    /**
     * Modifie le nombre d'attaques
     * 
     * @param {*} roll 
     */
    static async changeNbAttacks(event, target)
    {       
        this.nbAttacks += parseInt(target.dataset.value);
        if (this.nbAttacks < 1)
            this.nbAttacks = 1;

        await this.refresh();
    }

    /**
     * Modifie le nombre d'attaques
     * 
     * @param {*} roll 
     */
    async changeDamage(event, target)
    {        
        for (let i = 0; i < this.damages.length; i++)
        {
            if (this.damages[i].type == target.dataset.damage)
            {
                this.damages[i].value = target.value;
                break;
            }
        }        
    }

    /**
     * Ajoute/retire des dommages
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static addDamage(event, target)
    {
        const modif = parseInt(target.dataset.value);
        const dmg = target.dataset.damage;

        for (let i = 0; i < this.damages.length; i++)
        {
            if (this.damages[i].type == dmg)
            {
                let ov = parseInt(this.damages[i].value) ?? 0;
                // Si ov est Nan, alors on met 0
                if (isNaN(ov))
                    ov = 0;
                
                let value = ov + modif;
                if (value < 0) value = 0;
                if (value == 0) value = '';

                this.damages[i].value = value.toString();
                break;
            }
        }

        this.render();
    }

    /**
     * Modifie le nombre d'attaques
     * 
     * @param {*} roll 
     */
    async changeDC(event, target)
    {
        this.savingThrowDC = parseInt(target.value);
    }

    /**
     * Gestion de la résistance légendaire
     */
    async handleLegendaryResistance(token, score, dd)
    {
        if (!score || score >= dd) return score;  // jet réussi

        // râté ?
        const legendaryResistances = (token.actor.system.resources?.legres?.value || 0);
        
        if (legendaryResistances > 0) {
            const proceed = await foundry.applications.api.DialogV2.confirm({
                                title: `Résistance légendaire`,
                                content: `<p>${token.name} a raté son jet de sauvegarde mais dispose encore de ${legendaryResistances} résistance(s) légendaire(s). Souhaitez-vous en utiliser une pour réussir le jet ?</p>`,
                                modal: true,
                                rejectClose: false,
                            });

            if (proceed) {
                await token.actor.update({ "system.resources.legres.value": legendaryResistances - 1 });
                return dd;
            }
        }

        return score;
    }

    /**
     * Loupé !
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async missed(event, target)
    {
        const table = game.tables.getName(`Manqué !`);
        // si la table existe
        if (table)
        {
            // On détermine le message avec un tirage
            await table.draw();           
        }

        // On ferme la fenêtre 
        this.close();
    }

    /**
     * Appliquer les dommages à la cible
     * 
     * @param {*} event 
     * @param {*} target 
     */
    static async applyDamage(event, target)
    {
        // On fait un résumé des dégâts dans une chatcard diffusée par le jeton :
        let deadBy = null;

        for (let t = 0; t < this.targetTokens.length; t++) {
            const token = this.targetTokens[t];
            let chatContent = `<strong>Dommages</strong><br>`;
            
            let damageMultiplier = 1.0;
            // Si nous avons un jet de sauvegarde à faire, nous le faisons
            if (this.savingThrow !== '')
            {                
                const score = await this.handleLegendaryResistance(token, (await token.actor.rollAbilitySave(this.savingThrow, { dc: this.savingThrowDC, chatMessage: true }))?.total, this.savingThrowDC);
                if (score < this.savingThrowDC)
                {
                    chatContent += `✖ Jet de sauvegarde ${this.savingThrow} : ${score} < ${this.savingThrowDC} : raté !`;
                }
                else
                {
                    chatContent += `✔ Jet de sauvegarde ${this.savingThrow} : ${score} >= ${this.savingThrowDC} : réussi !`;
                    // Modification des dégâts
                    damageMultiplier = 1;
                    switch (this.savingThrowEffect)
                    {
                        case "none":
                            damageMultiplier = 0;
                            break;
                        case "half":
                            damageMultiplier = 0.5;
                            break;
                    }
                }
            }

            chatContent += `<table>`;
            let totalDamage = 0;
            for (let j = 0; j < this.damages.length; j++)
            {
                let d = this.damages[j].value;
                if (d)
                {
                    let dmg = 0;
                    // Si le dégât contient un dé (xdY), on le lance (on regarde avec un contains)
                    if (d.includes("d"))
                    {
                        // Injection dans d, la formule, du type de dégât derrière le dé : 12d6+4 => 12d6[feu]+4
                        // par regex ?
                        d = d.replace(/d(\d+)/, 'd$1[' + this.damages[j].type + ']');
                        const r = new Roll(d);
                        await r.roll();
                        r.toMessage({rollMode: "roll"}); // On affiche le jet de dé

                        dmg = r.total;
                    }
                    else
                        dmg = parseInt(d);

                    const base = dmg;
                    dmg *= damageMultiplier; 
                    dmg = Math.ceil(dmg);

                    // application des dégâts
                    const realDmg = token.actor.calculateDamage( [ {
                        value: dmg, 
                        type: this.damages[j].type,
                        //properties: this.attackResults[i].weapon.system.properties, 
                    } ]); 

                    let take = 0;
                    realDmg.forEach(dmg => { take += dmg.value; });
                    take = Math.ceil(take);

                    chatContent += `<tr><td>${this.damages[j].label}</td><td style="text-align: right;">`;
                    if (base != dmg)
                        chatContent += `${base} ➝ `;
                    
                    if (take != dmg)
                        chatContent += `<span style="text-decoration: line-through;">${dmg}</span> <i class="fas fa-shield-alt"></i> <strong>${take}</strong>`;
                    else
                        chatContent += `<strong>${dmg}</strong>`;
                    chatContent += `</td></tr>`;

                    totalDamage += take;
                }
            }

            chatContent += `<tr><td style="text-align: right"><strong>Total</strong></td><td style="text-align: right;"><strong>${totalDamage}</strong></td></tr>`;

            chatContent += `</table>`;

            await token.actor.applyDamage( [ {
                value: totalDamage, 
            } ]);

            // Si après, la cible est morte (pv <= 0), on lui met l'état "mort" si ce n'est pas un PJ               
            if (token.actor.system.attributes.hp.value <= 0)
            {       
                await token.actor.toggleStatusEffect("prone");
                await token.actor.toggleStatusEffect("unconscious");
                
                if (!token.actor.hasPlayerOwner) {                
                    await token.actor.toggleStatusEffect("dead");                    
                }

                // Si la créature est morte
                if (token.actor.system.attributes.hp.value <= 0)
                {
                    for (let j = 0; j < this.damages.length; j++)
                    {
                        let d = this.damages[j].value;
                        if (d)
                        {
                            deadBy = this.damages[j].type;
                        }
                    }
                }
            }
            else
            {
                for (let i = 0; i < this.nbAttacks; i++)
                {   
                    // On lance les jets de concentration au besoin
                    const concentration = token.actor.statuses.has("concentrating");
                    if (concentration && totalDamage > 0)
                    {
                        let dd = 10;
                        if (totalDamage / 2.0 > 10)
                            dd = Math.ceil(totalDamage / 2.0);
                        const r = await token.actor.rollConcentration({ targetValue: dd, });
                        if (t)
                        {
                            const score = await this.handleLegendaryResistance(token, r.total, dd);
                            if (score < dd)
                            {
                                // failed ! 
                                // on retire toutes les concentrations du token
                                let concentrationEffects = token.actor.effects.filter(eff => eff.name.toLowerCase().includes("concentr"));

                                chatContent += `✖ Concentration : ${score}/${dd} : raté !`;                            

                                for (let effect of concentrationEffects) {
                                    await effect.delete();
                                }
                            }
                            else
                            {
                                chatContent += `✔ Concentration : ${score}/${dd} : réussi !`;
                            }
                        }
                        else
                            chatContent += `✔ Concentration : ignoré !`;
                    }
                }                
                
                // On envoie le message
                let chatData = {
                    user: game.user._id,
                    speaker: ChatMessage.getSpeaker({ token: token.document }),
                    content: chatContent,        
                };
                ChatMessage.create(chatData);                
            }
        
            // On tire au hasard une fin tragique pour notre token dans le chat
            if (deadBy)
            {
                // Déjà, on indique que le token est mort dans le chat, en reprenant son nom
                let chatData = {
                    user: game.user._id,
                    speaker: ChatMessage.getSpeaker({ token: token.document }),
                    content: `<strong>${token.name}</strong> est mort${token.actor.hasPlayerOwner ? 'e' : ''} !`,                
                };
                ChatMessage.create(chatData);  

                // Ce texte est contenu dans une table aléatoire qui porte le nom de "Mises à mort - <type de dégât>"
                // le type de dégât doit être écrit avec la première lettre en majuscule
                const damageType = deadBy.charAt(0).toUpperCase() + deadBy.slice(1);
                const table = game.tables.getName(`Mises à mort - ${damageType}`);
                // si la table existe
                if (table)
                {
                    // On détermine le message avec un tirage
                    await table.draw();           
                }
            }
        };

        // On ferme la fenêtre 
        this.close();
    }
}