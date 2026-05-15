/**
 * Curated 30-book "Popular in India" feed.
 *
 * Why curated: Open Library's `subject:india` / `sort=editions` is dominated
 * by classic Western books that mention India once (Kipling, Doyle, …). The
 * Subjects API surfaces colonial-era titles. Neither captures what Indian
 * readers actually read. So we curate a list of well-known popular Indian
 * titles, biased toward the last ~20 years (Arundhati Roy 2017, Chetan
 * Bhagat 2014, Amish Tripathi 2010, etc.) with timeless inclusions
 * (Train to Pakistan, Discovery of India, Malgudi Days).
 *
 * Each entry has a verified Internet Archive identifier (`iaId`) so the
 * BookPreview page can serve full scanned pages via archive.org/embed.
 * Covers come from Open Library's covers service keyed by cover_i.
 */

const popularIndianBooks = [
  // ── 2010s+ ──────────────────────────────────────────────────────────────
  { title: 'The Ministry of Utmost Happiness',  author: 'Arundhati Roy',                   isbn: '3596036747',     iaId: 'leministereduboh0000roya',   coverId: 8055065,  year: '2017', description: 'A sweeping novel of contemporary India woven through Old Delhi, Kashmir, and a graveyard in between.' },
  { title: 'An Era of Darkness',                author: 'Shashi Tharoor',                  isbn: '9789383064656',  iaId: 'eraofdarknessbri0000thar',   coverId: 10866814, year: '2016', description: 'How British rule looted, impoverished, and damaged India — a sustained, evidence-driven case.' },
  { title: 'Em and the Big Hoom',               author: 'Jerry Pinto',                     isbn: '0670923591',     iaId: 'embighoom0000pint',          coverId: 8358336,  year: '2014', description: 'A tender Bombay family novel about a mother with bipolar disorder, narrated by her son.' },
  { title: 'Half Girlfriend',                   author: 'Chetan Bhagat',                   isbn: '9788129135728',  iaId: 'halfgirlfriend0000bhag',     coverId: 8783246,  year: '2014', description: 'A Bihari boy navigates Delhi, love, and class barriers — Bhagat at his bestselling peak.' },
  { title: 'The Lowland',                       author: 'Jhumpa Lahiri',                   isbn: '9783498039318',  iaId: 'didedefengxinzi0000lahi',    coverId: 7262503,  year: '2013', description: 'Two Calcutta-born brothers, the Naxalite movement, and a tragedy that crosses oceans and decades.' },
  { title: 'The Immortals of Meluha',           author: 'Amish Tripathi',                  isbn: '9788183860697',  iaId: 'meluhadantakatha0000amis',   coverId: 11152324, year: '2010', description: 'Book 1 of the Shiva Trilogy — Indian mythology re-imagined as fantasy adventure, a publishing phenomenon.' },
  { title: '2 States',                          author: 'Chetan Bhagat',                   isbn: '9788129113900',  iaId: 'dosea0000bhag',              coverId: 6994571,  year: '2009', description: 'A Punjabi boy and Tamil girl from IIM-A try to convince two families to let them marry.' },
  { title: 'The Palace of Illusions',           author: 'Chitra Banerjee Divakaruni',      isbn: '0307472493',     iaId: 'palaceofillusion00diva',     coverId: 2412074,  year: '2008', description: 'The Mahabharata retold from Draupadi’s point of view — feminist mythological fiction.' },
  { title: 'The White Tiger',                   author: 'Aravind Adiga',                   isbn: '1416562591',     iaId: 'whitetigernovel00adig_0',    coverId: 2787359,  year: '2008', description: '2008 Man Booker winner — a Bangalore chauffeur’s sardonic letter on the cost of climbing out of the rooster coop.' },
  { title: 'India After Gandhi',                author: 'Ramachandra Guha',                isbn: '9780230016545',  iaId: 'indiaaftergandhi00guha',     coverId: 6821235,  year: '2007', description: 'The definitive single-volume history of India since independence.' },
  { title: 'The Last Mughal',                   author: 'William Dalrymple',               isbn: '9789350293119',  iaId: 'lastmughalfallof0000dalr',   coverId: 9963901,  year: '2006', description: '1857, Bahadur Shah Zafar, and the fall of Delhi — narrative history that reads like a thriller.' },
  { title: 'Sea of Poppies',                    author: 'Amitav Ghosh',                    isbn: '1848541414',     iaId: 'liang.sseaofpoppies0000amit',coverId: 6956953,  year: '2008', description: 'Ibis Trilogy book 1 — opium, indenture, and the Bay of Bengal on the eve of the Opium Wars.' },
  { title: 'The Inheritance of Loss',           author: 'Kiran Desai',                     isbn: '1555845916',     iaId: 'inheritanceoflos0000desa_s4n6', coverId: 5728169, year: '2006', description: '2006 Booker — a retired judge in Kalimpong, his granddaughter’s love affair, and the Gorkhaland uprising.' },
  { title: 'Five Point Someone',                author: 'Chetan Bhagat',                   isbn: '9788129104595',  iaId: 'fivepointsomeone00bhag',     coverId: 6832129,  year: '2004', description: 'Three IIT roommates buckle under the system — the book that opened pop-fiction in India.' },
  { title: 'Maximum City',                      author: 'Suketu Mehta',                    isbn: '9780375403729',  iaId: 'maximumcitybomba00meht',     coverId: 225645,   year: '2004', description: 'Mumbai through gangsters, bar dancers, riot police and Bollywood — immersive long-form journalism.' },
  { title: 'The Hungry Tide',                   author: 'Amitav Ghosh',                    isbn: '0618329978',     iaId: 'hungrytidepaperb0000amit',   coverId: 10290,    year: '2004', description: 'A cetologist and a translator meet in the Sundarbans, where land, tide, and history rewrite each other.' },
  { title: 'Shantaram',                         author: 'Gregory David Roberts',           isbn: '8497936213',     iaId: 'isbn_9788489367111',         coverId: 6788945,  year: '2003', description: 'A fugitive Australian in 1980s Bombay — slum doctor, gangster, soldier, lover. India epic that became a Bombay cult classic.' },
  { title: 'The Glass Palace',                  author: 'Amitav Ghosh',                    isbn: '8129115344',     iaId: 'lepalaisdesmiroi0000amit',   coverId: 3326867,  year: '2000', description: 'Burma, Bengal and Malaya across a hundred years and three generations of a single family.' },
  { title: 'Wings of Fire',                     author: 'A.P.J. Abdul Kalam',              isbn: '9788173711466',  iaId: 'isbn_9788173711466',         coverId: 9153819,  year: '1999', description: 'The autobiography of India’s missile scientist who became its 11th President — a school-shelf staple.' },
  { title: 'Interpreter of Maladies',           author: 'Jhumpa Lahiri',                   isbn: '0395927200',     iaId: 'eentijdelijkonge0000lahi',   coverId: 4915588,  year: '1999', description: 'Pulitzer-winning short stories about Indian and Indian-American lives, large and very small.' },
  { title: 'The God of Small Things',           author: 'Arundhati Roy',                   isbn: '0679457313',     iaId: 'dergottderkleine00roya',     coverId: 10513792, year: '1997', description: '1997 Booker — Kerala twins, forbidden love, and the small things that change everything.' },
  { title: 'City of Djinns',                    author: 'William Dalrymple',               isbn: '0140143084',     iaId: 'cityofdjinnsyear0000dalr_f7j0', coverId: 4052, year: '1993', description: 'A year in Delhi — Sufis, eunuchs, partition memories, and seven cities one on top of another.' },
  { title: 'A Suitable Boy',                    author: 'Vikram Seth',                     isbn: '0948409126',     iaId: 'suitableboy0000seth',        coverId: 911254,   year: '1993', description: '1,349 pages, four families, post-Independence north India, and Mrs Rupa Mehra’s search for a son-in-law.' },
  { title: 'The Great Indian Novel',            author: 'Shashi Tharoor',                  isbn: '0670834319',     iaId: 'greatindiannovel00thar',     coverId: 4052784,  year: '1989', description: 'The Mahabharata retold as the story of the Indian independence movement — sly, comic, brilliant.' },
  { title: 'Malgudi Days',                      author: 'R.K. Narayan',                    isbn: '9788170730286',  iaId: 'malgudidays00nara',          coverId: 7981639,  year: '1943', description: '32 short stories from the fictional South Indian town that became indistinguishable from India itself.' },
  { title: "Midnight's Children",               author: 'Salman Rushdie',                  isbn: '1857152174',     iaId: 'mitternachtskind0000rush',   coverId: 8346713,  year: '1981', description: 'Booker of Bookers — Saleem Sinai, born at midnight on August 15 1947, holds India in his nose.' },
  { title: 'Train to Pakistan',                 author: 'Khushwant Singh',                 isbn: '9788174364449',  iaId: 'traintopakistan00khus',      coverId: 568646,   year: '1956', description: 'Partition in the Punjab village of Mano Majra — short, brutal, unforgettable.' },
  { title: 'The Discovery of India',            author: 'Jawaharlal Nehru',                isbn: '0143031031',     iaId: 'discoveryofindia0000jawa_i8d0', coverId: 128122, year: '1946', description: 'Nehru in Ahmednagar Fort prison surveying five thousand years of the subcontinent.' },
  { title: 'The Better Man',                    author: 'Anita Nair',                      isbn: '0312253117',     iaId: 'isbn_9780312253110',         coverId: 176996,   year: '1999', description: 'A retired government servant returns to his Kerala village to find a long-overdue accounting.' },
  { title: 'Why I am a Hindu',                  author: 'Shashi Tharoor',                  isbn: '9781787384903',  iaId: null,                         coverId: 9913009,  year: '2018', description: 'A modern, liberal case for Hinduism, distinct from political Hindutva — preview not on Internet Archive yet.' }
];

function popularIndianWithCovers() {
  return popularIndianBooks.map((b, idx) => ({
    id:          `popular-in-${idx + 1}`,
    title:       b.title,
    subtitle:    null,
    author:      b.author,
    isbn:        b.isbn,
    iaId:        b.iaId,
    status:      'available',
    thumbnail:   b.coverId
      ? `https://covers.openlibrary.org/b/id/${b.coverId}-M.jpg`
      : (b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg` : null),
    publisher:   null,
    publishedAt: b.year,
    pageCount:   null,
    categories:  ['Indian fiction'],
    description: b.description
  }));
}

module.exports = { popularIndianBooks, popularIndianWithCovers };
