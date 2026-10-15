extends RefCounted
## Versioned local save data. Invalid or incompatible data never moves the player.

const LANDMARK_IDS := ["sanctuary", "lotus", "gate", "sky_temple"]


func save_position(value: Vector3, path: String = "user://save.json") -> bool:
	if not valid_coordinates([value.x, value.y, value.z]):
		return false
	var data := {"version": 1, "position": [value.x, value.y, value.z]}
	return write_atomic(data, path)


func save_state(
	position: Vector3, discovered: Array, path: String = "user://save.json", quest_stage: int = 0
) -> bool:
	var coordinates := [position.x, position.y, position.z]
	if (
		not valid_coordinates(coordinates)
		or not valid_discovery(discovered)
		or not valid_quest_stage(quest_stage)
	):
		return false
	return write_atomic(
		{
			"version": 3,
			"position": coordinates,
			"discovered": discovered,
			"quest_stage": quest_stage
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
	var invalid := {"position": fallback, "discovered": [], "quest_stage": 0, "valid": false}
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
		or (version != 1 and version != 2 and version != 3)
	):
		return invalid
	var coordinates = data.get("position")
	if not valid_coordinates(coordinates):
		return invalid
	if (
		(version >= 2 and not valid_discovery(data.get("discovered")))
		or (version == 3 and not valid_quest_stage(data.get("quest_stage")))
	):
		return invalid
	var discovered: Array = []
	if version >= 2:
		discovered = data.discovered
	var quest_stage := 0
	if version == 3:
		quest_stage = int(data.quest_stage)
	return {
		"position": Vector3(coordinates[0], coordinates[1], coordinates[2]),
		"discovered": discovered,
		"quest_stage": quest_stage,
		"valid": true
	}


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
