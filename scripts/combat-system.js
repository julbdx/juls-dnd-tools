export class JulCombatSystem
{
    /**
     * Nom pour les ennemis
     */
    hostileNames = [
        'sombre', 'brutal', 'rugueux', 'hérissé', 'grimaçant', 
        'sanglant', 'inflexible', 'ombrageux', 'inquiétant', 'caverneux', 
        'spectral', 'poisseux', 'enragé', 'fourbe', 'sinistre', 
        'redoutable', 'vicieux', 'macabre', 'venimeux', 'ténébreux', 
        'décharné', 'vénéneux', 'furieux', 'baveux', 'trompeur', 
        'tatoué', 'farouche', 'maudit', 'cramoisi', 'fulgurant', 
        'lugubre', 'visqueux', 'féroce', 'barbare', 'ardent'
    ];

    // Nom hostile donné
    hostileNameGiven = 0;    

    /**
     * Musiques avant le combat
     */
    beforeCombatMusics = [];

    /**
     * Démarre la musique de combat proprement
     * 
     * @param {*} playlist à démarrer pour ce combat
     */
    async startMusicCombat(combatPlaylist)
    {
        this.beforeCombatMusics = [];                

        // on arrête toutes les musiques
        for (const playlist of game.playlists.filter(playlist => playlist.playing))
        {
            // On ne garde en mémoire que les playlists non soundboard ou
            // si le son actuel de la playlist est pas en mode repeat
            let playingSound = playlist.sounds.find(s => s.playing);
            if (playingSound && (playlist.mode !== CONST.PLAYLIST_MODES.SOUNDBOARD || playingSound.repeat))
            {
                this.beforeCombatMusics.push(playingSound);
                await playlist.stopAll();
            }
        }

        // on lance la playlist de combat
        if (combatPlaylist)
        {
            await combatPlaylist.update({ fade: 100 });
            await combatPlaylist.playAll();        
        }
    }

    /**
     * Restaure la musique d'origine
     * 
     * @param {*} duration des transitions
     */
    async stopMusicCombat(duration = 10)
    {
        // On arrête la playlist de combat doucement mais surement
        for (const playlist of game.playlists.filter(playlist => playlist.playing))
            await playlist.update({ fade: duration * 1000 });

        // Pour toutes les playlists de sons en cours de lecture, on programme la durée du fadeIn de reprise
        for (const playlist of this.beforeCombatMusics)
            await playlist.update({ fade: duration * 1000 });

        // On attends 1 seconde
        //await new Promise(resolve => setTimeout(resolve, 1000));

        for (const playlist of game.playlists.filter(playlist => playlist.playing))
            await playlist.stopAll();

        // On renvoi toutes les playlist d'avant combat
        for (const playlistSound of this.beforeCombatMusics)
            await playlistSound.parent.playSound(playlistSound);

        // On attends la fin du fade
        // await new Promise(resolve => setTimeout(resolve, duration * 1000));

        // Pour toutes les playlists de sons en cours de lecture, on programme la durée du fadeIn de reprise
        //for (const playlist of this.beforeCombatMusics)
        //    await playlist.update({ fade: 1000 });        
    }

    /**
     * Démarre le combat
     */
    async startCombat()
    {
        this.hostileNameGiven = Math.floor(Math.random() * this.hostileNames.length);

        let result = await this.selectTokensDialog();
        const tks = result.tokens;

        if (!tks || tks.length == 0)
            return null;    // Personne sélectionné, on laisse tomber !

        let combat = game.combat || await Combat.create({scene: canvas.scene.id, active: true});

        // On ajoute les combattants !
        for (let tokenId of tks)
        {
            if (!combat.getCombatantByToken(tokenId)) {
                await combat.createEmbeddedDocuments("Combatant", [{tokenId}]);
            }
        }

        // On démarre la musique de combat
        await this.startMusicCombat(result.playlist);

        // On démarre le combat
        await combat.startCombat();

        return combat;
    }

    /**
     * Arrête le combat
     */
    async stopCombat()
    {
        // On met fin au combat
        await game.combat.delete();

        // On arrête la musique de combat et restaure les anciennes
        await this.stopMusicCombat();
    }

    /**
     * Obtient tous les tokens ennemis à proximité des tokens alliés
     * @param {*} distance 
     */
    async getNearTokens(distance = 9)
    {    
        // Récupère tous les tokens sur la scène
        const allTokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.type != 'group');

        const friendlyTokens = allTokens.filter(t => t.document.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY);
        const hostileTokens = allTokens.filter(t => t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);

        // Crée un tableau pour stocker les jetons hostiles à sélectionner
        let nearTokens = [];

        // Parcourt tous les tokens pour trouver les jetons hostiles à distance
        friendlyTokens.forEach(friendlyToken => {
            hostileTokens.forEach(hostileToken => {
                // Si la distance est inférieure ou égale à la distance de sélection, ajoute le token à la liste
                if (canvas.grid.measurePath([friendlyToken.center, hostileToken.center]).distance <= distance) {
                    // Vérifier la ligne de vue en tenant compte des murs
                    const obstacles = CONFIG.Canvas.polygonBackends.sight.testCollision(hostileToken.center, friendlyToken.center, { type: "sight" });
                    if (obstacles.length == 0) {
                        nearTokens.push(hostileToken);
                    }
                }
            });
        });

        return nearTokens;
    }

    /*
    Sélection des jetons
    */
    async selectTokensDialog() {
        // Récupère toutes les playlists du dossier "Combats"                        
        let playlists = [];
        for (let playlist of game.playlists) {
            if (playlist.folder && playlist.folder.name === "Combats") {
                playlists.push(playlist);
            }
        }

        let preSelectedTokens = [];

        // On récupére tous les tokens actuellement sélectionnés sur la scène
        for (let token of canvas.tokens.controlled.filter(t => t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE))
            preSelectedTokens.push(token);

        // Si aucun n'est sélectionné, on les détermine en fonction de leur proximité
        if (preSelectedTokens.length === 0)
            preSelectedTokens = await this.getNearTokens();

        // Crée une promesse qui résoudra avec les jetons sélectionnés
        return new Promise(resolve => {
            // Séparer les jetons par disposition
            let tokens = canvas.tokens.placeables.filter(t => t.actor.type != 'group');

            // Créer des listes de cases à cocher pour chaque groupe
            let createCheckboxList = (tokens, disposition, selected) => tokens.map(t => 
                t.document.disposition === disposition ? 
                `<label>
                    <input type="checkbox" name="${t.id}" value="${t.id}" ${t.document.disposition !== 0 && (!selected || selected.includes(t)) ? 'checked' : ''}/> ${t.name}
                </label><br>` : ``
            ).join("");            

            let friendlyCheckboxes = createCheckboxList(tokens, CONST.TOKEN_DISPOSITIONS.FRIENDLY);
            let neutralCheckboxes = createCheckboxList(tokens, CONST.TOKEN_DISPOSITIONS.NEUTRAL);
            let hostileCheckboxes = createCheckboxList(tokens, CONST.TOKEN_DISPOSITIONS.HOSTILE, preSelectedTokens);

            // Crée le contenu HTML de la fenêtre de dialogue avec trois colonnes
            let dialogContent = `
                <div class="dnd5e chat-card">
                <div class="card-content">
                <form>
                    <div class="form-group">
                        <label for="playlist-select"><strong>Choisissez la playlist de combat :</strong></label>
                        <select id="playlist-select" name="playlist">
                            ${playlists.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="align-items: flex-start;">
                        <div>
                            <strong>Friendly</strong><br>
                            ${friendlyCheckboxes}
                        </div>
                        <div>
                            <strong>Neutral</strong><br>
                            ${neutralCheckboxes}
                        </div>
                        <div>
                            <strong>Hostile</strong><br>
                            ${hostileCheckboxes}
                        </div>                        
                    </div>
                </form></div></div>`;

            // Fonction pour gérer la soumission de la fenêtre
            let submitHandler = html => {
                let selectedTokenIds = [];
                html.find('input[type="checkbox"]:checked').each(function() {
                    selectedTokenIds.push($(this).val());
                });
                let selectedPlaylistId = html.find('select[name="playlist"]').val();
                let selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);

                resolve({ tokens: selectedTokenIds, playlist: selectedPlaylist });
            };

            // Crée et affiche la fenêtre de dialogue
            new Dialog({
                title: "Selection des adversaires du combat",
                content: dialogContent,                
                buttons: {
                    ok: {
                        icon: "<i class='fas fa-check'></i>",
                        label: "Validate",
                        callback: submitHandler
                    }
                },
                default: "ok",
                close: () => resolve([]) // Résout avec un tableau vide si la fenêtre est fermée
            }, 
            {
                classes: ["dnd5e"],
            }).render(true);
        });
    }


    /**
     * Round suivant !
     */
    async nextRound()
    {
        // On vérifie si le combat est commencé !
        let combat = null;
        let nextRound = false;

        if (!game.combat?.started)
        {
            // Non, on le démarre
            combat = await this.startCombat();
        }
        else
        {
            // Oui, on passe au round suivant
            combat = game.combat;
            nextRound = true;
        }

        if (!combat)
            return; // Si pas de combat à ce stade, on laisse tomber

        // On vérifie que tous les acteurs sont prêts pour ce combat :
        // Les acteurs sans initiative sont initialisés, les acteurs sans nom sont nommés
        let givenNames = null;
        
        // On fait un passage pour vérifier tt le monde
        for (let combatant of combat.combatants) {
            if (!combatant.token)
                continue;

            // Vérification de l'invisibilité à partir du statut ou d'un effet nommé "Invisible"
            if (combatant.token.hidden || combatant.token.actor.effects.find(e => e.id === "invisible" || e.name.toLowerCase().includes("invisible")))
                await combatant.update({ hidden: true });
            
            if (combatant.token.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE && (combatant.token && (!combatant.token.document || !combatant.token.document.actorLink))) {
                const hostileName = combatant.token.getFlag('world', 'hostileName');
                if (!hostileName) {
                    // Ok, visiblement on a pas de nom, on en génère un
                    if (!givenNames)
                    {
                        // Mais on a besoin de tous les noms distribués !
                        givenNames = [];
                        for (let combatant of combat.combatants) {            
                            if (combatant.token.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE && (combatant.token && (!combatant.token.document || !combatant.token.document.actorLink))) {
                              const hostileName = combatant.token.getFlag('world', 'hostileName');
                              if (hostileName)
                                givenNames.push(hostileName);
                            }
                        }
                    }

                    this.hostileNameGiven = (this.hostileNameGiven + 1) % this.hostileNames.length;
                    let basename = this.hostileNames[this.hostileNameGiven];
                    let name = basename;
                    let suffix = 0;
                    while (givenNames.includes(name))
                    {
                        suffix++;
                        name = `${basename} ${suffix}`;
                    }
                    givenNames.push(name);
                    await combatant.token.setFlag('world', 'hostileName', name);
                    await combatant.update({ name: combatant.name + ' ' + name });
                    if (combatant.token)
                        await combatant.token.update({ name: combatant.token.name + ' ' + name, displayName: 50 });
                }
            }

            // Initiative
            if (!combatant.initiative)
            {
                // On recherche l'initiative du même groupe d'acteur
                let sameActorInitiative = 0;
                for (let c of combat.combatants)
                {
                    if (c.actor?.name === combatant.actor?.name)
                    {
                        sameActorInitiative = c.initiative;
                        break;
                    }
                }
        
                if (!sameActorInitiative)          
                    await combat.rollInitiative(combatant.id); // pas d'initiative !
                else
                    await combat.setInitiative(combatant.id, sameActorInitiative);
            }
        }

        // On liste les tokens
        let opponents = combat.combatants.filter(
                            c => c.token.disposition === -1 && 
                            !c.defeated &&                             
                            !c.actor.effects.has("dnd5edead") && 
                            !c.actor.effects.has("dnd5eincapacited")
                        ); 
        
        // On vérifie que le combat n'est pas terminé
        if (opponents.length === 0)
        {
            // Plus aucun opposant, on arrête le combat
            await this.stopCombat();
            nextRound = false;  // Pas la peine de le continuer !
        }

        // Round suivant ?
        if (nextRound)
        {
            // Oui, on le démarre
            await combat.nextTurn();
        }
    }
}