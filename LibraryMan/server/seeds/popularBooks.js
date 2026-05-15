/**
 * Curated 30-book popular list used by GET /books/popular as a reliable
 * fallback when the Google Books proxy is unavailable / rate-limited.
 *
 * Cover URLs use Open Library's free Cover-by-ISBN service:
 *   https://covers.openlibrary.org/b/isbn/{ISBN}-M.jpg
 * Open Library serves a 1x1 transparent PNG when no cover is on file —
 * the client should treat that as "no cover" if needed.
 */
const popularBooks = [
  { title: 'The Pragmatic Programmer',                        author: 'Andrew Hunt & David Thomas',     isbn: '9780201616224', description: 'Classic guide to becoming a better programmer through pragmatic, language-agnostic principles.' },
  { title: 'Clean Code',                                      author: 'Robert C. Martin',               isbn: '9780132350884', description: 'A handbook of agile software craftsmanship — naming, functions, classes, and refactoring.' },
  { title: 'Refactoring',                                     author: 'Martin Fowler',                  isbn: '9780134757599', description: 'Improving the design of existing code through small, behavior-preserving transformations.' },
  { title: 'Design Patterns',                                 author: 'Erich Gamma et al.',             isbn: '9780201633610', description: 'The original Gang of Four book on reusable object-oriented design.' },
  { title: 'Code Complete',                                   author: 'Steve McConnell',                isbn: '9780735619678', description: 'A practical handbook of software construction — variables, control, and quality.' },
  { title: 'The Mythical Man-Month',                          author: 'Frederick P. Brooks Jr.',        isbn: '9780201835953', description: 'Essays on software engineering and project management — the original "adding people to a late project makes it later."' },
  { title: 'Introduction to Algorithms',                      author: 'Thomas H. Cormen et al.',        isbn: '9780262033848', description: 'The canonical CLRS textbook covering algorithm design and analysis.' },
  { title: 'Structure and Interpretation of Computer Programs', author: 'Harold Abelson & Gerald Sussman', isbn: '9780262510875', description: 'MIT\'s classic introduction to computation using Scheme — a.k.a. "The Wizard Book".' },
  { title: 'The Art of Computer Programming, Vol. 1',         author: 'Donald E. Knuth',                isbn: '9780201896831', description: 'Foundational algorithms and data structures from one of computing\'s pioneers.' },
  { title: 'Cracking the Coding Interview',                   author: 'Gayle Laakmann McDowell',        isbn: '9780984782857', description: '189 programming questions and solutions to prepare for technical interviews.' },
  { title: "You Don't Know JS Yet: Get Started",              author: 'Kyle Simpson',                   isbn: '9781091210099', description: 'Deep dive into the core mechanisms of the JavaScript language.' },
  { title: 'JavaScript: The Good Parts',                      author: 'Douglas Crockford',              isbn: '9780596517748', description: 'The short, sharp guide to the subset of JavaScript you actually want to use.' },
  { title: 'Eloquent JavaScript',                             author: 'Marijn Haverbeke',               isbn: '9781593279509', description: 'A modern introduction to programming via JavaScript, with progressively challenging projects.' },
  { title: 'Effective Java',                                  author: 'Joshua Bloch',                   isbn: '9780134685991', description: '90 best-practice items for writing readable, performant, idiomatic Java.' },
  { title: 'Java Concurrency in Practice',                    author: 'Brian Goetz',                    isbn: '9780321349606', description: 'The authoritative guide to writing correct concurrent code on the JVM.' },
  { title: 'The Linux Programming Interface',                 author: 'Michael Kerrisk',                isbn: '9781593272203', description: 'Definitive reference for the Linux/UNIX system programming interface.' },
  { title: 'Operating Systems: Three Easy Pieces',            author: 'Remzi & Andrea Arpaci-Dusseau',  isbn: '9781985086593', description: 'An accessible OS textbook organized around virtualization, concurrency, and persistence.' },
  { title: 'Computer Networking: A Top-Down Approach',        author: 'Kurose & Ross',                  isbn: '9780133594140', description: 'Networking textbook that starts from the application layer and works down.' },
  { title: 'Database System Concepts',                        author: 'Silberschatz, Korth, Sudarshan', isbn: '9780078022159', description: 'Standard university database textbook covering RDBMS theory and practice.' },
  { title: 'Designing Data-Intensive Applications',           author: 'Martin Kleppmann',               isbn: '9781449373320', description: 'How to build reliable, scalable, maintainable distributed data systems.' },
  { title: 'Site Reliability Engineering',                    author: 'Betsy Beyer et al.',             isbn: '9781491929124', description: 'Google\'s collected experience running production systems at scale.' },
  { title: 'The Phoenix Project',                             author: 'Gene Kim, Kevin Behr, George Spafford', isbn: '9780988262508', description: 'A novel about IT, DevOps, and helping your business win.' },
  { title: 'Continuous Delivery',                             author: 'Jez Humble & David Farley',      isbn: '9780321601919', description: 'Reliable software releases through build, test, and deployment automation.' },
  { title: 'Atomic Habits',                                   author: 'James Clear',                    isbn: '9780735211292', description: 'An easy and proven way to build good habits and break bad ones.' },
  { title: 'Deep Work',                                       author: 'Cal Newport',                    isbn: '9781455586691', description: 'Rules for focused success in a distracted world.' },
  { title: 'The Art of Unix Programming',                     author: 'Eric S. Raymond',                isbn: '9780131429017', description: 'Philosophy and practice of the Unix tradition by one of its evangelists.' },
  { title: 'Programming Pearls',                              author: 'Jon Bentley',                    isbn: '9780201657883', description: 'Short, deep essays on programming problems and clever solutions.' },
  { title: 'Working Effectively with Legacy Code',            author: 'Michael Feathers',               isbn: '9780131177055', description: 'Strategies for safely changing untested code under real-world constraints.' },
  { title: 'Domain-Driven Design',                            author: 'Eric Evans',                     isbn: '9780321125217', description: 'Tackling complexity in the heart of software by aligning code with the business domain.' },
  { title: 'Cracking the PM Interview',                       author: 'Gayle Laakmann McDowell & Jackie Bavaro', isbn: '9780984782819', description: 'How to land a product manager job in tech.' }
];

function popularWithCovers() {
  return popularBooks.map((b, idx) => ({
    id:          `popular-${idx + 1}`,
    title:       b.title,
    subtitle:    null,
    author:      b.author,
    isbn:        b.isbn,
    status:      'available',
    thumbnail:   `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg`,
    publisher:   null,
    publishedAt: null,
    pageCount:   null,
    categories:  [],
    description: b.description
  }));
}

module.exports = { popularBooks, popularWithCovers };
