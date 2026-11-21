(function() {
	// src/lib/members.ts
	var fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
	/** The member a typed name (« @lea », or « Léa » from an agent) refers to: an exact name first, then a prefix. */
	function findMember(space, name) {
		const wanted = fold(name.trim().replace(/^@/, ""));
		if (!wanted) return void 0;
		return space.members.find((m) => m.id === name || fold(m.name) === wanted) ?? space.members.find((m) => fold(m.name).startsWith(wanted));
	}
	// src/lib/dates.ts
	var pad = (n) => String(n).padStart(2, "0");
	var toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	function fromIso(iso) {
		const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
		return new Date(y, m - 1, d);
	}
	function addDays(iso, days) {
		const date = fromIso(iso);
		date.setDate(date.getDate() + days);
		return toIso(date);
	}
	/** Same day of the month, clamped to the month's last day (31 Jan + 1 month = 28 or 29 Feb). */
	function addMonths(iso, months) {
		const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
		const first = new Date(y, m - 1 + months, 1);
		const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
		return toIso(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)));
	}
	var daysBetween = (from, to) => Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 864e5);
	/** 0 for Monday … 6 for Sunday. */
	var weekday = (iso) => (fromIso(iso).getDay() + 6) % 7;
	var isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
	var isTime = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
	/** Today's date and the current time where the household lives. */
	function nowIn(timeZone, now = /* @__PURE__ */ new Date()) {
		const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23"
		}).formatToParts(now).map((p) => [p.type, p.value]));
		return {
			date: `${parts.year}-${parts.month}-${parts.day}`,
			time: `${parts.hour}:${parts.minute}`
		};
	}
	var DAYS$1 = [
		"lundi",
		"mardi",
		"mercredi",
		"jeudi",
		"vendredi",
		"samedi",
		"dimanche"
	];
	var MONTHS$1 = [
		"janv.",
		"févr.",
		"mars",
		"avr.",
		"mai",
		"juin",
		"juil.",
		"août",
		"sept.",
		"oct.",
		"nov.",
		"déc."
	];
	/** "Aujourd’hui", "Demain", "Hier", "jeudi" (within a week), "jeu. 4 déc.", "4 déc. 2027". */
	function dayLabel(iso, today) {
		const diff = daysBetween(today, iso);
		if (diff === 0) return "Aujourd’hui";
		if (diff === 1) return "Demain";
		if (diff === -1) return "Hier";
		const date = fromIso(iso);
		if (diff > 1 && diff < 7) return DAYS$1[weekday(iso)];
		const short = `${date.getDate()} ${MONTHS$1[date.getMonth()]}`;
		return date.getFullYear() === fromIso(today).getFullYear() ? `${DAYS$1[weekday(iso)].slice(0, 3)}. ${short}` : `${short} ${date.getFullYear()}`;
	}
	var timeLabel = (time) => time.replace(/^0(?=\d)/, "").replace(":", " h ").replace(/ h 00$/, " h");
	// src/lib/parse.ts
	var DAYS = [
		"lundi",
		"mardi",
		"mercredi",
		"jeudi",
		"vendredi",
		"samedi",
		"dimanche"
	];
	var MONTHS = [
		["janvier", "janv"],
		[
			"février",
			"fevrier",
			"févr",
			"fevr",
			"fév",
			"fev"
		],
		["mars"],
		["avril", "avr"],
		["mai"],
		["juin"],
		["juillet", "juil"],
		["août", "aout"],
		["septembre", "sept"],
		["octobre", "oct"],
		["novembre", "nov"],
		[
			"décembre",
			"decembre",
			"déc",
			"dec"
		]
	];
	var MONTH_PATTERN = MONTHS.flat().join("|");
	var NUMBER_WORDS = {
		un: 1,
		une: 1,
		deux: 2,
		trois: 3,
		quatre: 4,
		cinq: 5,
		six: 6,
		sept: 7,
		huit: 8,
		dix: 10
	};
	var amount = (word) => NUMBER_WORDS[word.toLowerCase()] ?? Number(word);
	/** A whole-word, case-insensitive pattern that also works around accented letters. */
	var words = (pattern) => new RegExp(`(?<![\\p{L}\\d])(?:${pattern})(?![\\p{L}\\d])`, "iu");
	/** The next date (today included) falling on a weekday, 0 for Monday. */
	var nextWeekday = (today, day, strictlyAfter = false) => {
		let offset = (day - weekday(today) + 7) % 7;
		if (offset === 0 && strictlyAfter) offset = 7;
		return addDays(today, offset);
	};
	/** `isMember` tells which @names are people of the space; others stay in the title. Without it, any @name is taken. */
	function parseQuickEntry(input, now, isMember = () => true) {
		let rest = ` ${input} `;
		const take = (pattern) => {
			const match = rest.match(pattern);
			if (match) rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`;
			return match;
		};
		const today = now.date;
		const entry = {
			title: "",
			priority: 0,
			tags: []
		};
		for (let tag = take(/(?<=\s)#([\p{L}\p{N}_-]+)/u); tag; tag = take(/(?<=\s)#([\p{L}\p{N}_-]+)/u)) entry.tags.push(tag[1]);
		const bangs = take(/(?<=\s)(!{1,3})(?=\s)/);
		if (bangs) entry.priority = bangs[1].length;
		const mention = [...rest.matchAll(/(?<=\s)@([\p{L}\p{N}_-]+)/gu)].find((m) => isMember(m[1]));
		if (mention && take(new RegExp(`(?<=\\s)@${mention[1]}(?=\\s)`, "u"))) entry.assignee = mention[1];
		let date;
		let repeat;
		let match;
		if (match = take(words(`(?:tous les|toutes les|chaque) (${DAYS.join("|")})s?`))) {
			repeat = {
				freq: "weekly",
				interval: 1
			};
			date = nextWeekday(today, DAYS.indexOf(match[1].toLowerCase()));
		} else if (match = take(words("(?:tous|toutes) les (\\d+|deux|trois|quatre|cinq|six) (jours|semaines|mois|ans|années)"))) {
			const unit = match[2].toLowerCase();
			repeat = {
				freq: unit === "jours" ? "daily" : unit === "semaines" ? "weekly" : unit === "mois" ? "monthly" : "yearly",
				interval: amount(match[1])
			};
		} else if (take(words("en semaine|du lundi au vendredi|les jours de semaine"))) repeat = {
			freq: "weekdays",
			interval: 1
		};
		else if (take(words("le week-end|les week-ends|chaque week-end|tous les week-ends"))) repeat = {
			freq: "weekends",
			interval: 1
		};
		else if (take(words("tous les jours|chaque jour|quotidiennement"))) repeat = {
			freq: "daily",
			interval: 1
		};
		else if (take(words("toutes les semaines|chaque semaine"))) repeat = {
			freq: "weekly",
			interval: 1
		};
		else if (take(words("tous les mois|chaque mois"))) repeat = {
			freq: "monthly",
			interval: 1
		};
		else if (take(words("tous les ans|chaque année|chaque an"))) repeat = {
			freq: "yearly",
			interval: 1
		};
		let time;
		if (match = take(words("(ce|demain|après-demain|apres-demain) (matin|après-midi|apres-midi|soir)|cet (après-midi|apres-midi)"))) {
			const when = (match[1] ?? "").toLowerCase();
			const part = (match[2] ?? match[3] ?? "").toLowerCase();
			time = part === "matin" ? "09:00" : part === "soir" ? "18:00" : "14:00";
			date = when === "demain" ? addDays(today, 1) : when.startsWith("apr") ? addDays(today, 2) : today;
		}
		if (match = take(words("(?:à|a|vers)\\s+midi"))) time = "12:00";
		else if (match = take(words("(?:(?:à|a|vers)\\s+)?(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?"))) {
			const hours = Number(match[1]);
			if (hours < 24) time = `${String(hours).padStart(2, "0")}:${match[2] ?? "00"}`;
		}
		if (!date) {
			if (take(words("aujourd[’']hui|aujourdhui"))) date = today;
			else if (take(words("après-demain|apres-demain"))) date = addDays(today, 2);
			else if (take(words("demain"))) date = addDays(today, 1);
			else if (take(words("avant-hier"))) date = addDays(today, -2);
			else if (take(words("hier"))) date = addDays(today, -1);
			else if (match = take(words("dans (\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix) (jours?|semaines?|mois|ans?|années?)"))) {
				const n = amount(match[1]);
				const unit = match[2].toLowerCase();
				date = unit.startsWith("jour") ? addDays(today, n) : unit.startsWith("semaine") ? addDays(today, 7 * n) : unit === "mois" ? addMonths(today, n) : addMonths(today, 12 * n);
			} else if (take(words("la semaine prochaine"))) date = nextWeekday(today, 0, true);
			else if (match = take(words(`(?:le |ce )?(${DAYS.join("|")})( prochain)?`))) {
				date = nextWeekday(today, DAYS.indexOf(match[1].toLowerCase()), true);
				if (match[2]) date = addDays(date, daysBetween(today, date) < 7 ? 7 : 0);
			} else if (match = take(words(`(?:le )?(\\d{1,2})(?:er)? (${MONTH_PATTERN})\\.?(?: (\\d{4}))?`))) {
				const month = MONTHS.findIndex((names) => names.includes(match[2].toLowerCase()));
				date = upcoming(today, Number(match[1]), month, match[3] ? Number(match[3]) : void 0);
			} else if (match = take(words("(?:le )?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?"))) {
				const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : void 0;
				date = upcoming(today, Number(match[1]), Number(match[2]) - 1, year);
			} else if (match = take(words("le (\\d{1,2})(?:er)?"))) date = upcoming(today, Number(match[1]), fromIso(today).getMonth(), void 0, true);
		}
		if (!date && time) date = time > now.time ? today : addDays(today, 1);
		if (!date && repeat) date = repeat.freq === "weekdays" ? nextWeekday(today, weekday(today) > 4 ? 0 : weekday(today)) : today;
		if (date) entry.due = time ? {
			date,
			time
		} : { date };
		if (repeat && date) entry.repeat = repeat;
		entry.title = rest.replace(/\s+/g, " ").replace(/\s+(?:à|a|le|la|pour|de|du|dans|vers|et)\s*$/i, "").trim();
		return entry;
	}
	/** The next date on that day and month (from today), or in that year. `rollMonth` moves "le 3" to next month once past. */
	function upcoming(today, day, month, year, rollMonth = false) {
		if (month < 0 || month > 11 || day < 1 || day > 31) return void 0;
		const now = fromIso(today);
		const candidate = (y, m) => {
			const date = new Date(y, m, day);
			return date.getMonth() === (m % 12 + 12) % 12 ? toIso(date) : void 0;
		};
		if (year) return candidate(year, month);
		const thisTime = candidate(now.getFullYear(), month);
		if (thisTime && thisTime >= today) return thisTime;
		return rollMonth ? candidate(now.getFullYear(), month + 1) : candidate(now.getFullYear() + 1, month);
	}
	// src/shared/space.ts
	var COLORS = [
		"red",
		"orange",
		"yellow",
		"green",
		"teal",
		"blue",
		"indigo",
		"purple",
		"pink",
		"brown",
		"gray"
	];
	var FREQUENCIES = [
		"daily",
		"weekdays",
		"weekends",
		"weekly",
		"monthly",
		"yearly"
	];
	var DEFAULT_LIST_ID = "rappels";
	var freshSpace = (timeZone) => ({
		lists: [{
			id: DEFAULT_LIST_ID,
			name: "Rappels",
			color: "pink",
			icon: "📋",
			order: 0,
			sections: []
		}],
		reminders: {},
		members: [],
		timeZone
	});
	/** The next date a repeating reminder is due after `date`, or undefined once past its end. */
	function nextDate(date, repeat) {
		const n = Math.max(1, Math.round(repeat.interval || 1));
		let next;
		switch (repeat.freq) {
			case "daily":
				next = addDays(date, n);
				break;
			case "weekdays":
				next = addDays(date, 1);
				while (weekday(next) > 4) next = addDays(next, 1);
				break;
			case "weekends":
				next = addDays(date, 1);
				while (weekday(next) < 5) next = addDays(next, 1);
				break;
			case "weekly":
				next = addDays(date, 7 * n);
				break;
			case "monthly":
				next = addMonths(date, n);
				break;
			case "yearly": next = addMonths(date, 12 * n);
		}
		return repeat.until && next > repeat.until ? void 0 : next;
	}
	var isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
	var isString = (value) => typeof value === "string";
	var text = (value, max) => isString(value) ? value.slice(0, max) : "";
	var finite = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
	var asDue = (value) => isObject(value) && isDate(value.date) ? {
		date: value.date,
		...isTime(value.time) ? { time: value.time } : {}
	} : void 0;
	var asRepeat = (value) => isObject(value) && FREQUENCIES.includes(value.freq) ? {
		freq: value.freq,
		interval: Math.min(365, Math.max(1, Math.round(finite(value.interval, 1)))),
		...isDate(value.until) ? { until: value.until } : {}
	} : void 0;
	var asPriority = (value) => [
		0,
		1,
		2,
		3
	].includes(value) ? value : 0;
	var asTags = (value) => Array.isArray(value) ? [...new Set(value.filter(isString).map((t) => t.trim().replace(/^#/, "").slice(0, 40)).filter(Boolean))].slice(0, 20) : [];
	function asList(value) {
		if (!isObject(value) || !isString(value.id) || !value.id) return void 0;
		return {
			id: value.id,
			name: text(value.name, 80) || "Sans titre",
			color: COLORS.includes(value.color) ? value.color : "blue",
			icon: text(value.icon, 8) || "📋",
			order: finite(value.order),
			sections: Array.isArray(value.sections) ? value.sections.filter((s) => isObject(s) && isString(s.id)).map((s) => ({
				id: s.id,
				name: text(s.name, 80) || "Section",
				order: finite(s.order)
			})) : []
		};
	}
	function asMember(value) {
		if (!isObject(value) || !isString(value.id) || !value.id) return void 0;
		const name = text(value.name, 40).trim();
		if (!name) return void 0;
		return {
			id: value.id,
			name,
			color: COLORS.includes(value.color) ? value.color : "blue"
		};
	}
	function asReminder(value) {
		if (!isObject(value) || !isString(value.id) || !value.id || !isString(value.listId)) return void 0;
		const due = asDue(value.due);
		const repeat = due ? asRepeat(value.repeat) : void 0;
		const early = due && typeof value.early === "number" && value.early > 0 ? Math.min(10080, Math.round(value.early)) : void 0;
		return {
			id: value.id,
			listId: value.listId,
			...isString(value.sectionId) ? { sectionId: value.sectionId } : {},
			...isString(value.parentId) && value.parentId !== value.id ? { parentId: value.parentId } : {},
			title: text(value.title, 500),
			...isString(value.notes) && value.notes ? { notes: text(value.notes, 5e3) } : {},
			...isString(value.url) && value.url ? { url: text(value.url, 2e3) } : {},
			...due ? { due } : {},
			...early ? { early } : {},
			...repeat ? { repeat } : {},
			priority: asPriority(value.priority),
			tags: asTags(value.tags),
			...isString(value.assignee) && value.assignee ? { assignee: value.assignee } : {},
			completed: value.completed === true,
			...value.completed === true && isString(value.completedAt) ? { completedAt: value.completedAt } : {},
			createdAt: isString(value.createdAt) ? value.createdAt : "1970-01-01T00:00:00.000Z",
			order: finite(value.order)
		};
	}
	/** A valid space from stored or received data, with defaults for anything missing or malformed. */
	function normalizeSpace(value, fallbackTimeZone) {
		const stored = isObject(value) ? value : {};
		const lists = (Array.isArray(stored.lists) ? stored.lists : []).flatMap((l) => asList(l) ?? []);
		const space = {
			lists: lists.length ? lists : freshSpace(fallbackTimeZone).lists,
			reminders: {},
			members: (Array.isArray(stored.members) ? stored.members : []).flatMap((m) => asMember(m) ?? []),
			timeZone: isString(stored.timeZone) && stored.timeZone ? stored.timeZone : fallbackTimeZone
		};
		const listIds = new Set(space.lists.map((l) => l.id));
		for (const raw of Object.values(isObject(stored.reminders) ? stored.reminders : {})) {
			const reminder = asReminder(raw);
			if (reminder && listIds.has(reminder.listId)) space.reminders[reminder.id] = withKnownAssignee(space, reminder);
		}
		return space;
	}
	/** Drops an assignee who isn't (or is no longer) a member of the space. */
	function withKnownAssignee(space, reminder) {
		if (!reminder.assignee || space.members.some((m) => m.id === reminder.assignee)) return reminder;
		const { assignee: _, ...rest } = reminder;
		return rest;
	}
	/** The reminder and every subtask under it, at any depth. */
	function withDescendants(space, id) {
		const ids = [id];
		for (let i = 0; i < ids.length; i++) for (const r of Object.values(space.reminders)) if (r.parentId === ids[i] && !ids.includes(r.id)) ids.push(r.id);
		return ids;
	}
	var without = (reminders, ids) => Object.fromEntries(Object.entries(reminders).filter(([id]) => !ids.includes(id)));
	function applyPatch(space, reminder, patch) {
		const next = { ...reminder };
		const set = (key, value) => {
			if (value === null || value === void 0 || value === "") delete next[key];
			else next[key] = value;
		};
		if ("title" in patch) next.title = text(patch.title, 500);
		if ("notes" in patch) set("notes", patch.notes ? text(patch.notes, 5e3) : null);
		if ("url" in patch) set("url", patch.url ? text(patch.url, 2e3) : null);
		if ("due" in patch) set("due", patch.due === null ? null : asDue(patch.due) ?? reminder.due);
		if ("early" in patch) set("early", typeof patch.early === "number" && patch.early > 0 ? Math.round(patch.early) : null);
		if ("repeat" in patch) set("repeat", patch.repeat === null ? null : asRepeat(patch.repeat) ?? reminder.repeat);
		if ("priority" in patch) next.priority = asPriority(patch.priority);
		if ("tags" in patch) next.tags = asTags(patch.tags);
		if ("assignee" in patch) set("assignee", space.members.some((m) => m.id === patch.assignee) ? patch.assignee : null);
		if ("order" in patch) next.order = finite(patch.order, reminder.order);
		if ("listId" in patch && space.lists.some((l) => l.id === patch.listId)) {
			next.listId = patch.listId;
			if (patch.listId !== reminder.listId) delete next.sectionId;
		}
		if ("sectionId" in patch) {
			const list = space.lists.find((l) => l.id === next.listId);
			set("sectionId", patch.sectionId && list?.sections.some((s) => s.id === patch.sectionId) ? patch.sectionId : null);
		}
		if ("parentId" in patch) {
			const parent = patch.parentId ? space.reminders[patch.parentId] : void 0;
			const valid = parent && !withDescendants(space, reminder.id).includes(parent.id);
			set("parentId", valid ? parent.id : null);
			if (valid) next.listId = parent.listId;
		}
		if (!next.due) {
			delete next.repeat;
			delete next.early;
		}
		return asReminder(next) ?? reminder;
	}
	function spaceReducer(space, action) {
		switch (action.type) {
			case "addList": {
				const list = asList(action.list);
				if (!list || space.lists.some((l) => l.id === list.id)) return space;
				return {
					...space,
					lists: [...space.lists, list]
				};
			}
			case "updateList": return {
				...space,
				lists: space.lists.map((l) => l.id === action.id ? {
					...l,
					...isString(action.name) && action.name.trim() ? { name: text(action.name.trim(), 80) } : {},
					...COLORS.includes(action.color) ? { color: action.color } : {},
					...isString(action.icon) && action.icon ? { icon: text(action.icon, 8) } : {}
				} : l)
			};
			case "deleteList": {
				if (space.lists.length <= 1 || !space.lists.some((l) => l.id === action.id)) return space;
				const gone = Object.values(space.reminders).filter((r) => r.listId === action.id).map((r) => r.id);
				return {
					...space,
					lists: space.lists.filter((l) => l.id !== action.id),
					reminders: without(space.reminders, gone)
				};
			}
			case "reorderLists": {
				if (!Array.isArray(action.ids)) return space;
				const rank = (id) => {
					const i = action.ids.indexOf(id);
					return i < 0 ? Infinity : i;
				};
				return {
					...space,
					lists: [...space.lists].sort((a, b) => rank(a.id) - rank(b.id)).map((l, order) => ({
						...l,
						order
					}))
				};
			}
			case "addSection":
			case "renameSection":
			case "deleteSection": return {
				...space,
				lists: space.lists.map((l) => {
					if (l.id !== action.listId) return l;
					if (action.type === "addSection") {
						const section = isObject(action.section) && isString(action.section.id) ? action.section : void 0;
						if (!section || l.sections.some((s) => s.id === section.id)) return l;
						return {
							...l,
							sections: [...l.sections, {
								id: section.id,
								name: text(section.name, 80) || "Section",
								order: finite(section.order)
							}]
						};
					}
					if (action.type === "renameSection") return {
						...l,
						sections: l.sections.map((s) => s.id === action.id && isString(action.name) && action.name.trim() ? {
							...s,
							name: text(action.name.trim(), 80)
						} : s)
					};
					return {
						...l,
						sections: l.sections.filter((s) => s.id !== action.id)
					};
				}),
				reminders: action.type === "deleteSection" ? Object.fromEntries(Object.entries(space.reminders).map(([id, r]) => {
					if (r.sectionId !== action.id) return [id, r];
					const { sectionId: _, ...rest } = r;
					return [id, rest];
				})) : space.reminders
			};
			case "addReminder": {
				const reminder = asReminder(action.reminder);
				if (!reminder || space.reminders[reminder.id] || !space.lists.some((l) => l.id === reminder.listId)) return space;
				const placed = reminder.parentId && !space.reminders[reminder.parentId] ? {
					...reminder,
					parentId: void 0
				} : reminder;
				return {
					...space,
					reminders: {
						...space.reminders,
						[placed.id]: withKnownAssignee(space, asReminder(placed))
					}
				};
			}
			case "updateReminder": {
				const reminder = space.reminders[action.id];
				if (!reminder || !isObject(action.patch)) return space;
				const updated = applyPatch(space, reminder, action.patch);
				let reminders = {
					...space.reminders,
					[updated.id]: updated
				};
				if (updated.listId !== reminder.listId) for (const id of withDescendants(space, updated.id).slice(1)) reminders = {
					...reminders,
					[id]: {
						...reminders[id],
						listId: updated.listId
					}
				};
				return {
					...space,
					reminders
				};
			}
			case "setCompleted": {
				const reminder = space.reminders[action.id];
				if (!reminder || !isString(action.at)) return space;
				if (!action.completed) {
					const { completedAt: _, ...rest } = reminder;
					return {
						...space,
						reminders: {
							...space.reminders,
							[reminder.id]: {
								...rest,
								completed: false
							}
						}
					};
				}
				const nextDue = asDue(action.nextDue);
				if (reminder.repeat && nextDue && isString(action.copyId) && !space.reminders[action.copyId]) {
					const { repeat: _r, ...rest } = reminder;
					const copy = {
						...rest,
						id: action.copyId,
						completed: true,
						completedAt: action.at
					};
					return {
						...space,
						reminders: {
							...space.reminders,
							[copy.id]: copy,
							[reminder.id]: {
								...reminder,
								due: nextDue
							}
						}
					};
				}
				const reminders = { ...space.reminders };
				for (const id of withDescendants(space, reminder.id)) reminders[id] = {
					...reminders[id],
					completed: true,
					completedAt: action.at
				};
				return {
					...space,
					reminders
				};
			}
			case "deleteReminder": return space.reminders[action.id] ? {
				...space,
				reminders: without(space.reminders, withDescendants(space, action.id))
			} : space;
			case "addMember": {
				const member = asMember(action.member);
				if (!member || space.members.some((m) => m.id === member.id) || space.members.length >= 20) return space;
				return {
					...space,
					members: [...space.members, member]
				};
			}
			case "renameMember": {
				const name = text(action.name, 40).trim();
				if (!name) return space;
				return {
					...space,
					members: space.members.map((m) => m.id === action.id ? {
						...m,
						name
					} : m)
				};
			}
			case "removeMember": {
				if (!space.members.some((m) => m.id === action.id)) return space;
				const members = space.members.filter((m) => m.id !== action.id);
				return {
					...space,
					members,
					reminders: Object.fromEntries(Object.entries(space.reminders).map(([id, r]) => {
						if (r.assignee !== action.id) return [id, r];
						const { assignee: _, ...rest } = r;
						return [id, rest];
					}))
				};
			}
			case "clearCompleted": {
				const gone = Object.values(space.reminders).filter((r) => r.completed && (!action.listId || r.listId === action.listId)).map((r) => r.id);
				return {
					...space,
					reminders: without(space.reminders, gone)
				};
			}
			case "setTimeZone": return isString(action.timeZone) && action.timeZone ? {
				...space,
				timeZone: action.timeZone
			} : space;
		}
	}
	// src/lib/views.ts
	var isOverdue = (r, now) => !r.completed && !!r.due && (r.due.date < now.date || r.due.date === now.date && !!r.due.time && r.due.time < now.time);
	/** Where a new reminder goes: after the last one of its list. */
	var orderAtEnd = (space, listId) => Math.max(0, ...Object.values(space.reminders).filter((r) => r.listId === listId).map((r) => r.order)) + 1;
	/** "Demain, 18 h", "Hier" (overdue), "lun. 4 déc." */
	function dueLabel(r, now) {
		if (!r.due) return void 0;
		const day = dayLabel(r.due.date, now.date);
		return r.due.time ? `${day}, ${timeLabel(r.due.time)}` : day;
	}
	var REPEAT_LABELS = {
		daily: "Tous les jours",
		weekdays: "En semaine",
		weekends: "Le week-end",
		weekly: "Toutes les semaines",
		monthly: "Tous les mois",
		yearly: "Tous les ans"
	};
	function repeatLabel(r) {
		if (!r.repeat) return void 0;
		const { freq, interval } = r.repeat;
		if (interval <= 1) return REPEAT_LABELS[freq];
		const unit = {
			daily: "jours",
			weekly: "semaines",
			monthly: "mois",
			yearly: "ans",
			weekdays: "",
			weekends: ""
		}[freq];
		return unit ? `Tous les ${interval} ${unit}` : REPEAT_LABELS[freq];
	}
	/** The action completing (or reopening) a reminder; a repeating one moves on to its next date. */
	function completeAction(r, completed, makeId, at = (/* @__PURE__ */ new Date()).toISOString()) {
		if (completed && r.repeat && r.due) {
			const date = nextDate(r.due.date, r.repeat);
			if (date) return {
				type: "setCompleted",
				id: r.id,
				completed,
				at,
				copyId: makeId(),
				nextDue: {
					...r.due,
					date
				}
			};
		}
		return {
			type: "setCompleted",
			id: r.id,
			completed,
			at
		};
	}
	var newId = () => crypto.randomUUID().slice(0, 12);
	// src/lib/entry.ts
	/** Quick entry for this space: « @Léa » assigns to Léa, and an @name that matches nobody stays in the title. */
	var parseEntry = (space, text, now) => parseQuickEntry(text, now, (name) => !!findMember(space, name));
	/** The action adding a reminder typed in quick entry (« Appeler maman demain 18h #famille »). */
	function addFromEntry(space, entry, defaults) {
		const due = entry.due ?? (defaults.date ? { date: defaults.date } : void 0);
		const assignee = entry.assignee ? findMember(space, entry.assignee) : void 0;
		const tags = [.../* @__PURE__ */ new Set([...entry.tags, ...defaults.tag ? [defaults.tag] : []])];
		return {
			type: "addReminder",
			reminder: {
				id: newId(),
				listId: defaults.listId,
				...defaults.sectionId ? { sectionId: defaults.sectionId } : {},
				...defaults.parentId ? { parentId: defaults.parentId } : {},
				title: entry.title,
				...assignee ? { assignee: assignee.id } : {},
				...due ? { due } : {},
				...entry.repeat && due ? { repeat: entry.repeat } : {},
				priority: entry.priority,
				tags,
				completed: false,
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				order: orderAtEnd(space, defaults.listId)
			}
		};
	}
	// src/shared/sync.ts
	/** What the device shows: the confirmed state with its own unconfirmed actions on top. */
	var visibleState = (sync) => sync.pending.reduce((state, e) => spaceReducer(state, e.action), sync.confirmed);
	/** Applies a server message. `resync` means a message was missed: ask for a fresh snapshot. */
	function receive(sync, message) {
		switch (message.t) {
			case "snapshot": return { sync: {
				...sync,
				confirmed: normalizeSpace(message.state, sync.confirmed.timeZone),
				version: message.version
			} };
			case "applied":
				if (message.version <= sync.version) return { sync };
				if (message.version !== sync.version + 1) return {
					sync,
					resync: true
				};
				return { sync: {
					confirmed: spaceReducer(sync.confirmed, message.action),
					version: message.version,
					pending: sync.pending.filter((e) => e.id !== message.id)
				} };
			case "duplicate":
			case "rejected": return { sync: {
				...sync,
				pending: sync.pending.filter((e) => e.id !== message.id)
			} };
			case "unknown":
			case "notice": return { sync };
		}
	}
	// src/native/core.ts
	if (typeof globalThis.crypto?.randomUUID !== "function" && typeof __nativeUUID === "function") globalThis.crypto = { randomUUID: __nativeUUID };
	var state = {
		key: null,
		joined: false,
		sync: {
			confirmed: freshSpace("Europe/Paris"),
			version: 0,
			pending: []
		}
	};
	var effects = (outbox = [], extra = {}) => JSON.stringify({
		outbox,
		...extra
	});
	/** The sync state saved on the device, or nothing for a first launch. */
	function init(persisted, timeZone) {
		let stored = null;
		try {
			stored = persisted ? JSON.parse(persisted) : null;
		} catch {}
		const sync = stored?.sync && typeof stored.sync.key === "string" ? stored.sync : void 0;
		state = {
			key: sync?.key ?? null,
			joined: sync?.joined === true,
			sync: {
				confirmed: normalizeSpace(stored?.space, timeZone),
				version: sync && Number.isInteger(sync.version) ? sync.version : sync ? -1 : 0,
				pending: Array.isArray(sync?.pending) ? sync.pending : []
			}
		};
	}
	function persisted() {
		const { key, joined, sync } = state;
		return JSON.stringify({
			space: sync.confirmed,
			sync: key ? {
				key,
				version: sync.version,
				pending: sync.pending,
				joined
			} : void 0
		});
	}
	/** What the device shows, and how it stands with the server. */
	var snapshot = () => JSON.stringify({
		space: visibleState(state.sync),
		key: state.key,
		joined: state.joined,
		pending: state.sync.pending.length
	});
	function dispatch(action, id) {
		const parsed = JSON.parse(action);
		if (!state.key) {
			state = {
				...state,
				sync: {
					...state.sync,
					confirmed: spaceReducer(state.sync.confirmed, parsed)
				}
			};
			return effects();
		}
		const envelope = {
			id,
			action: parsed
		};
		state = {
			...state,
			sync: {
				...state.sync,
				pending: [...state.sync.pending, envelope]
			}
		};
		return effects([{
			t: "act",
			...envelope
		}]);
	}
	/** The socket just opened: ask for the space. */
	var opened = () => effects([{ t: "hello" }]);
	function onMessage(text) {
		const message = JSON.parse(text);
		if (message.t === "notice") return effects([], { notice: message.text });
		if (message.t === "unknown") {
			leave();
			return effects([], {
				unknown: true,
				notice: "Ce lien d’invitation ne marche pas ou plus. Tu gardes tes propres listes."
			});
		}
		const { sync, resync } = receive(state.sync, message);
		state = {
			...state,
			sync
		};
		const outbox = [];
		if (message.t === "snapshot") {
			state = {
				...state,
				joined: true
			};
			for (const envelope of sync.pending) outbox.push({
				t: "act",
				...envelope
			});
		}
		if (resync) outbox.push({ t: "hello" });
		return effects(outbox);
	}
	/** The space this device starts on the server with, when it has none yet. */
	var spaceToCreate = () => JSON.stringify(visibleState(state.sync));
	/** The server created the space. Changes made meanwhile are in it. */
	function created(key, version) {
		if (state.key) return;
		state = {
			key,
			joined: true,
			sync: {
				confirmed: visibleState(state.sync),
				version,
				pending: []
			}
		};
	}
	/** Replaces this device's space with a shared one, once it arrives. */
	function join(key) {
		if (key === state.key) return;
		state = {
			key,
			joined: false,
			sync: {
				...state.sync,
				version: -1,
				pending: []
			}
		};
	}
	/** Stops sharing: this device keeps a copy, which becomes a new space of its own once created. */
	function leave() {
		state = {
			key: null,
			joined: false,
			sync: {
				confirmed: visibleState(state.sync),
				version: 0,
				pending: []
			}
		};
	}
	/** The action adding a reminder typed in quick entry, with the defaults of the screen it's typed on. */
	var entryAction = (text, defaults, now) => {
		const space = visibleState(state.sync);
		const parsed = parseEntry(space, text, JSON.parse(now));
		return parsed.title ? JSON.stringify(addFromEntry(space, parsed, JSON.parse(defaults))) : "null";
	};
	/** What quick entry understands in a text, to show it as it's typed. */
	var parse = (text, now) => JSON.stringify(parseEntry(visibleState(state.sync), text, JSON.parse(now)));
	/** Completing a reminder, or reopening it. A repeating one moves on to its next date. */
	var complete = (id, completed) => {
		const reminder = visibleState(state.sync).reminders[id];
		return reminder ? JSON.stringify(completeAction(reminder, completed, () => crypto.randomUUID().slice(0, 12))) : "null";
	};
	/** The labels of every reminder at `now`: due ("Demain, 18 h"), overdue, repeat. */
	function labels(now) {
		const at = JSON.parse(now);
		const result = {};
		for (const r of Object.values(visibleState(state.sync).reminders)) {
			const due = dueLabel(r, at);
			const repeat = repeatLabel(r);
			result[r.id] = {
				...due ? { due } : {},
				...r.due?.time ? { time: timeLabel(r.due.time) } : {},
				overdue: isOverdue(r, at),
				...repeat ? { repeat } : {}
			};
		}
		return JSON.stringify(result);
	}
	var day = (iso, today) => dayLabel(iso, today);
	var time = (hhmm) => timeLabel(hhmm);
	/** Today and now where the household lives. */
	var nowInZone = (timeZone) => JSON.stringify(nowIn(timeZone));
	globalThis.TickleCore = {
		init,
		persisted,
		snapshot,
		dispatch,
		opened,
		onMessage,
		spaceToCreate,
		created,
		join,
		leave,
		entryAction,
		parse,
		complete,
		labels,
		day,
		time,
		nowInZone
	};
})();
