-- Watch lists (backlog #59): a schedule can capture several URLs per run.
-- urls: JSON array of the schedule's URLs, in order, when it has more than
--   one. NULL for a single-URL schedule, whose URL stays in url. url always
--   holds the first URL, so code that reads url alone keeps working.
ALTER TABLE schedules ADD COLUMN urls TEXT DEFAULT NULL;
