import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, doc, query, orderBy, deleteDoc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyChd4JZBR0dizRm-2BbfEFpdsB1XIFgrjU",
    authDomain: "radio-colegio.firebaseapp.com",
    projectId: "radio-colegio",
    storageBucket: "radio-colegio.firebasestorage.app",
    messagingSenderId: "1077092808398",
    appId: "1:1077092808398:web:f58c80f86b45c287fec29f",
    measurementId: "G-LGK89QHWV0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const PREDEFINED_ARTISTS = [
    { name: 'Bad Bunny' }, { name: 'Rauw Alejandro' }, { name: 'Feid' }, 
    { name: 'Blessd' }, { name: 'Karol G' }, { name: 'Álvaro Díaz' }, 
    { name: 'Mora' }, { name: 'Maluma' }, { name: 'Kris R' },
    { name: 'Ryan Castro' }, { name: 'Rels B' }, { name: 'Omar Courtz' },
    { name: 'J Balvin' }, { name: 'Myke Towers' }, { name: 'Eladio Carrión' }, 
    { name: 'Quevedo' }, { name: 'Young Miko' }, { name: 'Jhayco' },
    { name: 'Grupo Frontera' }, { name: 'Romeo Santos' }, { name: 'Nsqk' },
    { name: 'Bizarrap' }, { name: 'Marc Anthony' }, { name: 'Héctor Lavoe' }, 
    { name: 'Willie Colón' }
];

let deviceId = localStorage.getItem('radio_device_id');
if (!deviceId) {
    deviceId = 'Usuario-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    localStorage.setItem('radio_device_id', deviceId);
}

let currentTab = 'songs';
let currentFeedData = [];
let isAdmin = false;

const tabs = document.querySelectorAll('.tab');
const addBtn = document.getElementById('addBtn');
const adminBtn = document.getElementById('adminBtn');
const adminPanel = document.getElementById('adminPanel');
const resetBtn = document.getElementById('resetBtn');
const searchModal = document.getElementById('searchModal');
const closeModal = document.getElementById('closeModal');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const feed = document.getElementById('feed');
const statusBadge = document.getElementById('statusBadge');
const searchView = document.getElementById('searchView');
const manualView = document.getElementById('manualView');
const manualName = document.getElementById('manualName');
const manualSubtitle = document.getElementById('manualSubtitle');
const saveManualBtn = document.getElementById('saveManualBtn');
const cancelManualBtn = document.getElementById('cancelManualBtn');

// Actualizar la interfaz dependiendo si eres Admin y en qué pestaña estás
function updateUI() {
    if (currentTab === 'artists') {
        if (isAdmin) {
            addBtn.classList.remove('hidden');
            addBtn.innerHTML = '<i class="fas fa-plus"></i> Agregar Artista';
        } else {
            addBtn.classList.add('hidden');
        }
        manualSubtitle.style.display = 'none';
    } else {
        addBtn.classList.remove('hidden');
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Sugerir Canción';
        manualSubtitle.style.display = 'block';
    }
}

onSnapshot(doc(db, "system", "config"), (docSnap) => {
    if (docSnap.exists()) {
        const isLive = docSnap.data().isLive;
        statusBadge.textContent = isLive ? "En Vivo" : "Apagado";
        statusBadge.className = isLive ? "status-badge live" : "status-badge off";
    }
});

statusBadge.addEventListener('click', async () => {
    if (isAdmin) {
        const isCurrentlyLive = statusBadge.classList.contains('live');
        await setDoc(doc(db, "system", "config"), { isLive: !isCurrentlyLive }, { merge: true });
    }
});

adminBtn.addEventListener('click', () => {
    if (!isAdmin) {
        const pass = prompt("Ingresa el PIN de acceso:");
        if (pass === "1404") {
            isAdmin = true;
            statusBadge.classList.add('admin-mode');
            adminPanel.classList.remove('hidden');
            alert("Modo DJ Activado.");
            updateUI();
            renderFeed();
        } else if (pass !== null) alert("PIN incorrecto");
    } else {
        isAdmin = false;
        statusBadge.classList.remove('admin-mode');
        adminPanel.classList.add('hidden');
        alert("Modo DJ Desactivado");
        updateUI();
        renderFeed();
    }
});

resetBtn.addEventListener('click', async () => {
    if (!isAdmin) return;
    if (currentTab === 'songs') {
        if (confirm("⚠️ ¿Eliminar TODAS las canciones de la lista?")) {
            const querySnapshot = await getDocs(collection(db, "songs"));
            querySnapshot.forEach(doc => deleteDoc(doc.ref));
            alert("Canciones eliminadas.");
        }
    } else if (currentTab === 'artists') {
        if (confirm("⚠️ ¿Reiniciar todos los votos de los artistas a 0?")) {
            const querySnapshot = await getDocs(collection(db, "artists"));
            querySnapshot.forEach(doc => updateDoc(doc.ref, { likes: 0, dislikes: 0, score: 0 }));
            alert("Votos reiniciados.");
        }
    }
});

tabs.forEach(tab => {
    tab.addEventListener('click', async (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentTab = e.target.dataset.tab;
        
        updateUI();
        if (currentTab === 'artists') await checkAndInitializeArtists(); 
        
        loadFeed();
    });
});

addBtn.addEventListener('click', () => {
    searchModal.classList.remove('hidden');
    
    // Si eres admin y estás en artistas, ve directo a manual
    if (currentTab === 'artists' && isAdmin) {
        searchView.style.display = 'none';
        manualView.style.display = 'flex';
        manualName.value = '';
        manualName.focus();
    } else {
        searchView.style.display = 'block';
        manualView.style.display = 'none';
        searchInput.value = '';
        searchResults.innerHTML = '';
        searchInput.focus();
    }
});

closeModal.addEventListener('click', () => searchModal.classList.add('hidden'));

function fetchDeezer(queryTerm) {
    return new Promise((resolve) => {
        const callbackName = 'deezerCb_' + Date.now();
        window[callbackName] = (data) => {
            delete window[callbackName];
            document.getElementById(callbackName).remove();
            resolve(data);
        };
        const script = document.createElement('script');
        script.src = `https://api.deezer.com/search/track?q=${encodeURIComponent(queryTerm)}&limit=15&output=jsonp&callback=${callbackName}`;
        script.id = callbackName;
        document.body.appendChild(script);
    });
}

let timeout = null;
searchInput.addEventListener('input', (e) => {
    clearTimeout(timeout);
    const queryTerm = e.target.value.trim();
    if (queryTerm.length < 2) { searchResults.innerHTML = ''; return; }

    timeout = setTimeout(async () => {
        const data = await fetchDeezer(queryTerm);
        if (data && data.data) processSearchResults(data.data);
    }, 500);
});

function processSearchResults(results) {
    searchResults.innerHTML = '';
    let filteredResults = [];
    const seen = new Set();

    results.forEach(item => {
        const key = item.title + item.artist.name;
        if (!seen.has(key)) {
            seen.add(key);
            let imgUrl = item.album && item.album.cover_medium ? item.album.cover_medium : '';
            filteredResults.push({ name: item.title, subName: item.artist.name, img: imgUrl });
        }
    });

    filteredResults.slice(0, 10).forEach(item => {
        const div = document.createElement('div');
        const isAlreadyAdded = currentFeedData.some(feedItem => feedItem.title.toLowerCase() === item.name.toLowerCase());
        
        div.className = `result-item ${isAlreadyAdded ? 'disabled-item' : ''}`;
        div.innerHTML = `
            ${item.img ? `<img src="${item.img}" class="album-art" alt="Portada">` : ''}
            <div>
                <h4 style="color: var(--text-main); font-size:1rem;">${item.name}</h4>
                <p style="font-size: 0.8rem; color: ${isAlreadyAdded ? 'var(--color-primary)' : 'var(--text-muted)'};">
                    ${isAlreadyAdded ? 'Ya sugirieron esto' : item.subName}
                </p>
            </div>
        `;
        if (!isAlreadyAdded) div.addEventListener('click', () => addToDatabase(item.name, item.subName, item.img));
        searchResults.appendChild(div);
    });

    const manualAddDiv = document.createElement('div');
    manualAddDiv.style.marginTop = '15px';
    manualAddDiv.innerHTML = `
        <button class="apple-btn" style="background: transparent; border: 1px solid #555; color: var(--text-main); font-size: 0.9rem; padding: 10px;">
            ¿No lo encuentras? Agregar manualmente
        </button>
    `;
    manualAddDiv.addEventListener('click', () => {
        searchView.style.display = 'none';
        manualView.style.display = 'flex';
        manualName.value = searchInput.value;
        manualSubtitle.value = '';
        manualName.focus();
    });
    searchResults.appendChild(manualAddDiv);
}

cancelManualBtn.addEventListener('click', () => {
    manualView.style.display = 'none';
    searchView.style.display = 'block';
    searchInput.focus();
});

saveManualBtn.addEventListener('click', () => {
    const name = manualName.value.trim();
    const subName = currentTab === 'songs' ? manualSubtitle.value.trim() : 'Artista';
    if (name.length < 2) { alert("Escribe un nombre válido."); return; }
    addToDatabase(name, subName || 'Desconocido', '');
});

async function addToDatabase(title, subtitle, img) {
    searchModal.classList.add('hidden');
    await addDoc(collection(db, currentTab), {
        title, subtitle, img,
        likes: 1, dislikes: 0, score: 1,
        disabled: false, played: false, reason: "",
        addedBy: deviceId,
        timestamp: new Date()
    });
}

async function checkAndInitializeArtists() {
    const q = query(collection(db, "artists"));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
        let defaultScore = PREDEFINED_ARTISTS.length; 
        for (const artist of PREDEFINED_ARTISTS) {
            await addDoc(collection(db, "artists"), {
                title: artist.name,
                subtitle: 'Artista',
                img: '', 
                likes: 0,
                dislikes: 0,
                score: defaultScore,
                disabled: false,
                played: false,
                reason: "",
                addedBy: 'Sistema',
                timestamp: new Date()
            });
            defaultScore--;
        }
    }
}

function loadFeed() {
    const q = query(collection(db, currentTab), orderBy('score', 'desc'));
    onSnapshot(q, (snapshot) => {
        currentFeedData = [];
        snapshot.forEach(docSnap => {
            currentFeedData.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderFeed();
    });
}

function renderFeed() {
    feed.innerHTML = '';
    currentFeedData.forEach(data => {
        const id = data.id;
        const currentVote = localStorage.getItem(`vote_${currentTab}_${id}`);

        const card = document.createElement('div');
        card.className = `card ${data.disabled ? 'disabled' : ''} ${data.played ? 'played' : ''}`;
        
        const showImage = currentTab === 'songs' && data.img && data.img.startsWith('http');

        let cardHTML = `
            <div class="card-content">
                ${showImage ? `<img src="${data.img}" class="album-art" alt="Portada">` : ''}
                <div class="info">
                    ${data.played ? '<span class="played-badge">✓ Ya sonó</span>' : ''}
                    <h3>${data.disabled ? `<strike>${data.title}</strike>` : data.title}</h3>
                    <p>${data.disabled ? `<span class="banned-text">${data.reason || 'Bloqueado'}</span>` : data.subtitle}</p>
                    ${isAdmin && data.addedBy !== 'Sistema' ? `<span class="admin-text">Por: ${data.addedBy}</span>` : ''}
                </div>
            </div>
        `;

        if (isAdmin) {
            cardHTML += `
                <div class="actions admin-actions">
                    <button class="${data.played ? 'btn-active' : ''}" onclick="adminAction('${id}', 'togglePlay')">
                        <i class="fas ${data.played ? 'fa-undo' : 'fa-check'}"></i> ${data.played ? 'Desmarcar' : 'Sonó'}
                    </button>
                    <button class="${data.disabled ? 'btn-active' : ''}" onclick="adminAction('${id}', 'toggleBan')">
                        <i class="fas ${data.disabled ? 'fa-unlock' : 'fa-ban'}"></i> ${data.disabled ? 'Habilitar' : 'Bloquear'}
                    </button>
                    <button class="btn-delete" onclick="adminAction('${id}', 'delete')"><i class="fas fa-trash"></i></button>
                </div>
            `;
        } else if (!data.disabled) {
            cardHTML += `
                <div class="actions">
                    <button class="btn-like ${currentVote === 'like' ? 'voted' : ''}" onclick="handleVote('${id}', 'like')">
                        <i class="fas fa-arrow-up"></i> ${data.likes}
                    </button>
                    <button class="btn-dislike ${currentVote === 'dislike' ? 'voted' : ''}" onclick="handleVote('${id}', 'dislike')">
                        <i class="fas fa-arrow-down"></i> ${data.dislikes}
                    </button>
                </div>
                <div class="sticker-container" id="sticker_${id}"></div>
            `;
        }

        card.innerHTML = cardHTML;
        feed.appendChild(card);
    });
}

window.handleVote = async (id, type) => {
    const itemData = currentFeedData.find(item => item.id === id);
    if(!itemData) return;

    let { likes, dislikes } = itemData;
    const voteKey = `vote_${currentTab}_${id}`;
    const currentVote = localStorage.getItem(voteKey);

    if (currentVote === type) {
        if (type === 'like') likes--;
        if (type === 'dislike') dislikes--;
        localStorage.removeItem(voteKey);
    } else {
        if (type === 'like') { likes++; if (currentVote === 'dislike') dislikes--; } 
        else if (type === 'dislike') { dislikes++; if (currentVote === 'like') likes--; }
        localStorage.setItem(voteKey, type);
        
        const stickerContainer = document.getElementById(`sticker_${id}`);
        stickerContainer.innerHTML = `<div class="sticker sticker-${type}">${type === 'like' ? '+1' : '-1'}</div>`;
        setTimeout(() => stickerContainer.innerHTML = '', 800);
    }

    await updateDoc(doc(db, currentTab, id), { likes, dislikes, score: likes - dislikes });
};

window.adminAction = async (id, action) => {
    const docRef = doc(db, currentTab, id);
    const itemData = currentFeedData.find(item => item.id === id);
    
    if (action === 'delete') {
        if (confirm("¿Eliminar por completo?")) await deleteDoc(docRef);
    } else if (action === 'toggleBan') {
        if (itemData.disabled) {
            await updateDoc(docRef, { disabled: false, reason: "" });
        } else {
            const reason = prompt("Motivo del bloqueo:");
            if (reason !== null) await updateDoc(docRef, { disabled: true, reason: reason });
        }
    } else if (action === 'togglePlay') {
        await updateDoc(docRef, { played: !itemData.played, disabled: false, reason: "" });
    }
};

updateUI();
loadFeed();
