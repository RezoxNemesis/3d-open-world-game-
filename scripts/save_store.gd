extends RefCounted
## Versioned local save data. Invalid or incompatible data never moves the player.

const RECORD_IDS := ["hall", "bridge", "shrine"]
const EMPTY_ACTIVITY := {"records": [], "blessed": false}
const CRAG_IDS := ["crag_east", "crag_north", "crag_ridge"]
const EMPTY_HERO := {"flying": false, "fast": false, "destroyed": []}

const LANDMARK_IDS := ["sanctuary", "lotus", "gate", "sky_temple", "fox_shrine"]


func save_position(value: Vector3, path: String = "user://save.json") -> bool:
	if not valid_coordinates([value.x, value.y, value.z]):
		return false
	var data := {"version": 1, "position": [value.x, value.y, value.z]}
	return write_atomic(data, path)


func save_state(
	position: Vector3,
	discovered: Array,
	path: String = "user://save.json",
	quest_stage: int = 0,
	activity_state: Dictionary = {},
	hero_state: Dictionary = {}
) -> bool:
	var coordinates := [position.x, position.y, position.z]
	var activity := EMPTY_ACTIVITY.duplicate(true) if activity_state.is_empty() else activity_state
	var hero := EMPTY_HERO.duplicate(true) if hero_state.is_empty() else hero_state
	if (
		not valid_coordinates(coordinates)
		or not valid_discovery(discovered)
		or not valid_quest_stage(quest_stage)
		or not valid_activity(activity, quest_stage)
		or not valid_hero(hero)
	):
		return false
	return write_atomic(
		{
			"version": 5,
			"position": coordinates,
			"discovered": discovered,
			"quest_stage": quest_stage,
			"activity_state": activity,
			"hero_state": hero
		},
		path
	)


func write_atomic(data: Dictionary, path: String) -> bool:
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		DirAccess.remove_absolute(path + ".tmp")
		return false
	if DirAccess.rename_absolute(path + ".tmp", path) != OK:
		DirAccess.remove_absolute(path + ".tmp")
		return false
	return true


func load_position(
	path: String = "user://save.json", fallback: Vector3 = Vector3(0, 2, 12)
) -> Vector3:
	return load_state(path, fallback).position


func load_state(
	path: String = "user://save.json", fallback: Vector3 = Vector3(0, 2, 12)
) -> Dictionary:
	var invalid := {
		"position": fallback,
		"discovered": [],
		"quest_stage": 0,
		"activity_state": EMPTY_ACTIVITY.duplicate(true),
		"hero_state": EMPTY_HERO.duplicate(true),
		"valid": false
	}
	if not FileAccess.file_exists(path):
		return invalid
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > 4096:
		return invalid
	var parser := JSON.new()
	var parse_result := parser.parse(file.get_as_text())
	var data = parser.data
	var version: Variant = data.get("version") if data is Dictionary else null
	if (
		parse_result != OK
		or not data is Dictionary
		or typeof(version) not in [TYPE_FLOAT, TYPE_INT]
		or (version < 1 or version > 5 or version != floor(version))
	):
		return invalid
	var coordinates = data.get("position")
	if not valid_coordinates(coordinates):
		return invalid
	if (
		(version >= 2 and not valid_discovery(data.get("discovered")))
		or (version >= 3 and not valid_quest_stage(data.get("quest_stage")))
		or (version >= 4 and not valid_activity(data.get("activity_state"), int(data.quest_stage)))
		or (version == 5 and not valid_hero(data.get("hero_state")))
	):
		return invalid
	var discovered: Array = []
	if version >= 2:
		discovered = data.discovered
	var quest_stage := 0
	if version >= 3:
		quest_stage = int(data.quest_stage)
	return {
		"position": Vector3(coordinates[0], coordinates[1], coordinates[2]),
		"discovered": discovered,
		"quest_stage": quest_stage,
		"activity_state":
		data.activity_state.duplicate(true) if version >= 4 else EMPTY_ACTIVITY.duplicate(true),
		"hero_state":
		data.hero_state.duplicate(true) if version == 5 else EMPTY_HERO.duplicate(true),
		"valid": true
	}


func valid_hero(value: Variant) -> bool:
	if not value is Dictionary or value.size() != 3:
		return false
	if typeof(value.get("flying")) != TYPE_BOOL or typeof(value.get("fast")) != TYPE_BOOL:
		return false
	var destroyed: Variant = value.get("destroyed")
	if not destroyed is Array or destroyed.size() > CRAG_IDS.size():
		return false
	var seen := {}
	for id in destroyed:
		if not id is String or id not in CRAG_IDS or seen.has(id):
			return false
		seen[id] = true
	return true


func valid_activity(value: Variant, quest_stage: int) -> bool:
	if not value is Dictionary or value.size() != 2:
		return false
	var records: Variant = value.get("records")
	var blessed: Variant = value.get("blessed")
	if not records is Array or typeof(blessed) != TYPE_BOOL or records.size() > 3:
		return false
	var seen := {}
	for id in records:
		if not id is String or id not in RECORD_IDS or seen.has(id):
			return false
		seen[id] = true
	return not blessed or (seen.size() == 3 and quest_stage == 3)


func valid_quest_stage(value: Variant) -> bool:
	# JSON parses numbers as floats. Accept only integer-valued stages; booleans,
	# fractional values and strings must never grant quest progress.
	return (
		typeof(value) in [TYPE_INT, TYPE_FLOAT]
		and value >= 0
		and value <= 3
		and value == floor(value)
	)


func valid_discovery(ids: Variant) -> bool:
	if not ids is Array or ids.size() > LANDMARK_IDS.size():
		return false
	var seen := {}
	for id in ids:
		if not id is String or id not in LANDMARK_IDS or seen.has(id):
			return false
		seen[id] = true
	return true


func valid_coordinates(coordinates: Variant) -> bool:
	if not coordinates is Array or coordinates.size() != 3:
		return false
	for value in coordinates:
		if not (value is float or value is int) or not is_finite(float(value)):
			return false
	var point := Vector3(coordinates[0], coordinates[1], coordinates[2])
	return (
		absf(point.x) <= 10000 and absf(point.z) <= 10000 and point.y >= -100 and point.y <= 10000
	)
