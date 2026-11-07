/**
 * The 66 books (Protestant canon, NIV names and chapter counts) with a short introduction for each.
 * Introductions are original summaries (no Bible text is reproduced); authorship and dates give the
 * traditional view and, where it's commonly debated, say so.
 */

export type Book = {
  name: string;
  testament: "OT" | "NT";
  chapters: number;
  /** Who wrote it, traditionally. */
  author: string;
  /** Approximate date of writing. */
  written: string;
  /** What the book is about, in one or two sentences. */
  theme: string;
};

export const BOOKS: Book[] = [
  { name: "Genesis", testament: "OT", chapters: 50, author: "Traditionally Moses", written: "c. 1440–1400 BC (traditional)", theme: "Beginnings: creation, the fall, the flood and God's covenant with Abraham, Isaac, Jacob and Joseph — the start of the promise that runs through the whole Bible." },
  { name: "Exodus", testament: "OT", chapters: 40, author: "Traditionally Moses", written: "c. 1440–1400 BC (traditional)", theme: "God rescues Israel from slavery in Egypt, gives the law at Sinai and comes to dwell among his people in the tabernacle." },
  { name: "Leviticus", testament: "OT", chapters: 27, author: "Traditionally Moses", written: "c. 1440–1400 BC (traditional)", theme: "How a holy God can live among an unholy people: sacrifices, priesthood, purity and the call to 'be holy, because I am holy'." },
  { name: "Numbers", testament: "OT", chapters: 36, author: "Traditionally Moses", written: "c. 1440–1400 BC (traditional)", theme: "Forty years in the wilderness — Israel's grumbling and unbelief, and God's patience in bringing a new generation to the edge of the promised land." },
  { name: "Deuteronomy", testament: "OT", chapters: 34, author: "Traditionally Moses", written: "c. 1400 BC (traditional)", theme: "Moses' farewell sermons: a renewal of the covenant, calling Israel to love the Lord with all their heart before entering the land." },
  { name: "Joshua", testament: "OT", chapters: 24, author: "Traditionally Joshua (with later additions)", written: "c. 1400–1350 BC (traditional)", theme: "Israel enters and settles the promised land under Joshua; God keeps his promises, and the people are called to choose whom they will serve." },
  { name: "Judges", testament: "OT", chapters: 21, author: "Unknown (traditionally Samuel)", written: "c. 1050–1000 BC", theme: "A cycle of sin, oppression, crying out and rescue through judges like Deborah, Gideon and Samson — 'everyone did as they saw fit'." },
  { name: "Ruth", testament: "OT", chapters: 4, author: "Unknown", written: "Monarchy period", theme: "A Moabite widow's loyalty and Boaz's kindness as kinsman-redeemer — a quiet story of providence that leads to King David." },
  { name: "1 Samuel", testament: "OT", chapters: 31, author: "Unknown (uses records of Samuel, Nathan and Gad)", written: "After 930 BC", theme: "From judges to kings: Samuel, the rise and fall of Saul, and God choosing David, a man after his own heart." },
  { name: "2 Samuel", testament: "OT", chapters: 24, author: "Unknown", written: "After 930 BC", theme: "David's reign — his triumphs, God's covenant promising an everlasting throne, his sin with Bathsheba and its painful consequences." },
  { name: "1 Kings", testament: "OT", chapters: 22, author: "Unknown (traditionally Jeremiah)", written: "c. 560–540 BC", theme: "Solomon's wisdom and temple, the kingdom's split into Israel and Judah, and Elijah's stand against Baal." },
  { name: "2 Kings", testament: "OT", chapters: 25, author: "Unknown (traditionally Jeremiah)", written: "c. 560–540 BC", theme: "Elisha's ministry and the decline of both kingdoms until Israel falls to Assyria and Judah to Babylon." },
  { name: "1 Chronicles", testament: "OT", chapters: 29, author: "Traditionally Ezra", written: "c. 450–400 BC", theme: "Israel's history retold for those back from exile, focusing on David, worship and God's covenant with his line." },
  { name: "2 Chronicles", testament: "OT", chapters: 36, author: "Traditionally Ezra", written: "c. 450–400 BC", theme: "Solomon's temple and the kings of Judah, highlighting revival under faithful kings and ending with the hope of return." },
  { name: "Ezra", testament: "OT", chapters: 10, author: "Traditionally Ezra", written: "c. 440 BC", theme: "Exiles return from Babylon, rebuild the temple and are called back to God's law." },
  { name: "Nehemiah", testament: "OT", chapters: 13, author: "Nehemiah (with Ezra)", written: "c. 430 BC", theme: "Rebuilding Jerusalem's walls through prayer, courage and hard work, and renewing the people's covenant with God." },
  { name: "Esther", testament: "OT", chapters: 10, author: "Unknown", written: "c. 460–350 BC", theme: "A Jewish queen in Persia risks her life to save her people — God's name is never mentioned, yet his hand is everywhere." },
  { name: "Job", testament: "OT", chapters: 42, author: "Unknown", written: "Uncertain", theme: "A righteous man suffers and wrestles with God; the book confronts easy answers and ends with God revealing his wisdom and power." },
  { name: "Psalms", testament: "OT", chapters: 150, author: "David and others (Asaph, sons of Korah, Solomon, Moses)", written: "c. 1400–400 BC", theme: "Israel's songbook and prayer book — praise, lament, thanksgiving, confession and trust for every season of life." },
  { name: "Proverbs", testament: "OT", chapters: 31, author: "Mainly Solomon (also Agur and Lemuel)", written: "c. 950–700 BC", theme: "Practical wisdom for everyday life, rooted in 'the fear of the Lord is the beginning of wisdom'." },
  { name: "Ecclesiastes", testament: "OT", chapters: 12, author: "'The Teacher' (traditionally Solomon)", written: "Uncertain", theme: "Life 'under the sun' is fleeting and puzzling; enjoy God's gifts, and fear God and keep his commandments." },
  { name: "Song of Songs", testament: "OT", chapters: 8, author: "Traditionally Solomon", written: "c. 950 BC (traditional)", theme: "A celebration of love and desire between a bride and groom, read also as a picture of God's love for his people." },
  { name: "Isaiah", testament: "OT", chapters: 66, author: "Isaiah son of Amoz (authorship of later chapters debated)", written: "c. 740–680 BC", theme: "Judgment and comfort: the Holy One of Israel, the suffering servant and the promise of a new heaven and a new earth." },
  { name: "Jeremiah", testament: "OT", chapters: 52, author: "Jeremiah (recorded by Baruch)", written: "c. 627–580 BC", theme: "The 'weeping prophet' warns Judah before Babylon's conquest and promises a new covenant written on the heart." },
  { name: "Lamentations", testament: "OT", chapters: 5, author: "Traditionally Jeremiah", written: "c. 586 BC", theme: "Five poems of grief over Jerusalem's fall, with a center of hope: 'his compassions never fail… great is your faithfulness'." },
  { name: "Ezekiel", testament: "OT", chapters: 48, author: "Ezekiel", written: "c. 593–570 BC", theme: "A priest-prophet in exile sees God's glory leave and return; dry bones live again and God promises a new heart." },
  { name: "Daniel", testament: "OT", chapters: 12, author: "Traditionally Daniel (date debated)", written: "6th century BC (traditional)", theme: "Faithfulness in Babylon — the fiery furnace, the lions' den — and visions of God's kingdom outlasting every empire." },
  { name: "Hosea", testament: "OT", chapters: 14, author: "Hosea", written: "c. 750–715 BC", theme: "A prophet's marriage to an unfaithful wife pictures Israel's unfaithfulness and God's relentless, redeeming love." },
  { name: "Joel", testament: "OT", chapters: 3, author: "Joel", written: "Uncertain", theme: "A locust plague calls the people to return to God; he promises to pour out his Spirit on all people." },
  { name: "Amos", testament: "OT", chapters: 9, author: "Amos, a shepherd from Tekoa", written: "c. 760–750 BC", theme: "A cry for justice against comfortable religion — 'let justice roll on like a river'." },
  { name: "Obadiah", testament: "OT", chapters: 1, author: "Obadiah", written: "Probably after 586 BC", theme: "Judgment on Edom for its pride and violence against Judah, and the kingdom belonging to the Lord." },
  { name: "Jonah", testament: "OT", chapters: 4, author: "Unknown (about Jonah son of Amittai)", written: "Uncertain", theme: "A reluctant prophet, a great fish and a repentant city — God's mercy reaches even Israel's enemies." },
  { name: "Micah", testament: "OT", chapters: 7, author: "Micah of Moresheth", written: "c. 735–700 BC", theme: "Judgment and hope, a ruler from Bethlehem, and what the Lord requires: act justly, love mercy, walk humbly." },
  { name: "Nahum", testament: "OT", chapters: 3, author: "Nahum", written: "c. 663–612 BC", theme: "The fall of Nineveh — God is slow to anger but will not leave the guilty unpunished; a refuge for those who trust him." },
  { name: "Habakkuk", testament: "OT", chapters: 3, author: "Habakkuk", written: "c. 605 BC", theme: "A prophet questions God about injustice and learns that 'the righteous person will live by faith', ending in joyful trust." },
  { name: "Zephaniah", testament: "OT", chapters: 3, author: "Zephaniah", written: "c. 640–620 BC", theme: "The day of the Lord brings judgment, but God will rejoice over his restored people with singing." },
  { name: "Haggai", testament: "OT", chapters: 2, author: "Haggai", written: "520 BC", theme: "Returned exiles are urged to put God first and finish rebuilding the temple." },
  { name: "Zechariah", testament: "OT", chapters: 14, author: "Zechariah", written: "c. 520–480 BC", theme: "Visions encouraging the rebuilders, and prophecies of a humble king riding on a donkey and the Lord's coming reign." },
  { name: "Malachi", testament: "OT", chapters: 4, author: "Malachi", written: "c. 450–430 BC", theme: "A call to wholehearted worship and faithfulness, ending with the promise of a messenger before the day of the Lord." },
  { name: "Matthew", testament: "NT", chapters: 28, author: "Matthew (Levi), the tax collector", written: "c. AD 50–70", theme: "Jesus as the promised Messiah and King who fulfills the Scriptures — with the Sermon on the Mount and the Great Commission." },
  { name: "Mark", testament: "NT", chapters: 16, author: "John Mark (from Peter's preaching)", written: "c. AD 55–65", theme: "A fast-moving account of Jesus the Son of God, who came to serve and give his life as a ransom for many." },
  { name: "Luke", testament: "NT", chapters: 24, author: "Luke the physician", written: "c. AD 60–62", theme: "An orderly account of Jesus the Savior of all — with special care for the poor, women, outsiders and the lost." },
  { name: "John", testament: "NT", chapters: 21, author: "John the apostle", written: "c. AD 85–95", theme: "Signs and 'I am' sayings written 'that you may believe that Jesus is the Messiah, the Son of God, and have life'." },
  { name: "Acts", testament: "NT", chapters: 28, author: "Luke", written: "c. AD 62", theme: "The Holy Spirit empowers the church to carry the good news from Jerusalem to Rome, through Peter and Paul." },
  { name: "Romans", testament: "NT", chapters: 16, author: "Paul", written: "c. AD 57", theme: "The gospel explained: all have sinned, all can be justified by faith in Christ, and the new life in the Spirit." },
  { name: "1 Corinthians", testament: "NT", chapters: 16, author: "Paul", written: "c. AD 55", theme: "Paul addresses a gifted but divided church — unity, holiness, spiritual gifts, love and the resurrection." },
  { name: "2 Corinthians", testament: "NT", chapters: 13, author: "Paul", written: "c. AD 55–56", theme: "Paul's most personal letter: ministry through weakness, comfort in suffering and grace that is sufficient." },
  { name: "Galatians", testament: "NT", chapters: 6, author: "Paul", written: "c. AD 48–55", theme: "Freedom in Christ: we are justified by faith, not by works of the law, and called to walk by the Spirit." },
  { name: "Ephesians", testament: "NT", chapters: 6, author: "Paul", written: "c. AD 60–62", theme: "Every spiritual blessing in Christ, one new people of God, and how to live it out — including the armor of God." },
  { name: "Philippians", testament: "NT", chapters: 4, author: "Paul", written: "c. AD 61–62", theme: "A joyful letter from prison: Christ's humility, pressing on toward the goal and contentment in all circumstances." },
  { name: "Colossians", testament: "NT", chapters: 4, author: "Paul", written: "c. AD 60–62", theme: "The supremacy and sufficiency of Christ over every power, and new life hidden with him." },
  { name: "1 Thessalonians", testament: "NT", chapters: 5, author: "Paul", written: "c. AD 50–51", theme: "Encouragement for a young church under pressure — holy living and hope in Christ's return." },
  { name: "2 Thessalonians", testament: "NT", chapters: 3, author: "Paul", written: "c. AD 51–52", theme: "Clarity about the day of the Lord, perseverance under persecution and a call to keep working." },
  { name: "1 Timothy", testament: "NT", chapters: 6, author: "Paul", written: "c. AD 62–64", theme: "Instructions to a young leader on sound teaching, prayer, church leadership and godliness with contentment." },
  { name: "2 Timothy", testament: "NT", chapters: 4, author: "Paul", written: "c. AD 66–67", theme: "Paul's last letter: guard the gospel, endure hardship, and remember that all Scripture is God-breathed." },
  { name: "Titus", testament: "NT", chapters: 3, author: "Paul", written: "c. AD 63–65", theme: "Setting the church in order on Crete — good leaders, sound doctrine and the grace that teaches us to live well." },
  { name: "Philemon", testament: "NT", chapters: 1, author: "Paul", written: "c. AD 60–62", theme: "A personal appeal for a runaway slave, Onesimus, to be welcomed back as a brother in Christ." },
  { name: "Hebrews", testament: "NT", chapters: 13, author: "Unknown", written: "Before AD 70", theme: "Jesus is greater than angels, Moses and the old priesthood — so hold firm, run the race and fix your eyes on him." },
  { name: "James", testament: "NT", chapters: 5, author: "James, the brother of Jesus", written: "c. AD 45–50", theme: "Faith that works: trials, taming the tongue, caring for the poor, and wisdom from above." },
  { name: "1 Peter", testament: "NT", chapters: 5, author: "Peter", written: "c. AD 62–64", theme: "Living hope for believers who suffer as 'foreigners and exiles', following the example of Christ." },
  { name: "2 Peter", testament: "NT", chapters: 3, author: "Peter", written: "c. AD 64–68", theme: "Grow in grace and knowledge, beware of false teachers, and trust that the Lord's patience is not slowness." },
  { name: "1 John", testament: "NT", chapters: 5, author: "John the apostle", written: "c. AD 85–95", theme: "Assurance for believers: walk in the light, love one another, because God is love." },
  { name: "2 John", testament: "NT", chapters: 1, author: "John the apostle", written: "c. AD 85–95", theme: "A short note urging love and obedience and warning against deceivers." },
  { name: "3 John", testament: "NT", chapters: 1, author: "John the apostle", written: "c. AD 85–95", theme: "Praise for Gaius's hospitality to traveling teachers, and a rebuke of the proud Diotrephes." },
  { name: "Jude", testament: "NT", chapters: 1, author: "Jude, the brother of James", written: "c. AD 65–80", theme: "Contend for the faith against those who distort grace, and rest in the one who is able to keep you from stumbling." },
  { name: "Revelation", testament: "NT", chapters: 22, author: "John", written: "c. AD 95", theme: "Visions of the risen Christ, the Lamb who was slain, God's victory over evil, and the new heaven and new earth." },
];

export const bookByName = (name: string) => BOOKS.find((b) => b.name === name);
