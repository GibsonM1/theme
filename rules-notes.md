# Rules Playground checks (Firebase console > Realtime Database > Rules > Rules Playground)

Paste `database.rules.json`, then run these with **Authenticated** on (provider: Anonymous, uid `u1`) unless noted.
Use a 20-character room id such as `-Nabcdefghijklmnopqr`. Expected result in brackets.

1. Unauthenticated read of `/rooms/ionagrams/P3` [deny]. Authenticated read [allow]. Read of `/rooms/ionagrams` or `/` [deny].
2. Read `/rooms/Bad Game/P3` or `/rooms/ionagrams/p-3` [deny]. Read `/settings/ionagrams/P3` [allow].
3. Set `/rooms/ionagrams/P3/-Nabcdefghijklmnopqr/meta` = `{"name":"Room 1","max":4,"created":1,"state":"lobby","round":0,"gen":0}` [allow].
   Same with `"state":"go"`, a 41-char name, or an extra key `"x":1` [deny]. Set meta to null [deny].
4. With that meta saved in the simulated data: set `.../players/u1` = `{"name":"Ana","joined":1,"ready":false}` [allow];
   `.../players/u2` [deny]; `.../players/u1` with no `name` [deny]; `.../players/u1` in a room with no meta [deny].
5. `.../data/boards/u1` [allow], `.../data/boards/u2` [deny], `.../data/flags/0/u1` [allow], `.../data/flags/0/u2` [deny],
   `.../data/done` and `.../data/out/u2` [allow]. Set `.../data` to null [allow]; set `.../data` to `{"x":1}` [deny].
6. Remove the whole room `/rooms/ionagrams/P3/-Nabcdefghijklmnopqr` while `players` has an entry [deny]; with no players [allow].
7. Set `/settings/ionagrams/P3` = `{"minNaming":"pick"}` [allow]; set `/settings/Ionagrams/P3` (capital I) [deny].
8. Write anything at `/foo` [deny].

Known choices: any signed-in student can change meta (needed so any browser can be host) and teacher settings
(anonymous auth can't tell teacher from student). `watchLobby` reads the whole period, so no `.indexOn` is needed.
