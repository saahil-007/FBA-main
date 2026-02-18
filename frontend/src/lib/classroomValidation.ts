/**
 * Classroom validation utilities
 * Validates classroom numbers for floors 3-11, rooms 301-310
 */

export interface ClassroomInfo {
  floor: number;
  room: number;
  isValid: boolean;
  error?: string;
}

/**
 * Validates if a classroom number is in the valid range (301-310 for floors 3-11)
 * @param classroom - Classroom number as string or number
 * @returns ClassroomInfo object with validation details
 */
export function validateClassroom(classroom: string | number): ClassroomInfo {
  const classroomNum = typeof classroom === 'string' ? parseInt(classroom) : classroom;
  
  if (isNaN(classroomNum)) {
    return {
      floor: 0,
      room: 0,
      isValid: false,
      error: 'Invalid classroom number'
    };
  }
  
  if (classroomNum < 301 || classroomNum > 1110) {
    return {
      floor: 0,
      room: 0,
      isValid: false,
      error: 'Classroom must be between 301 and 1110'
    };
  }
  
  const floor = Math.floor(classroomNum / 100);
  const room = classroomNum % 100;
  
  // Validate floor range (3-11)
  if (floor < 3 || floor > 11) {
    return {
      floor,
      room,
      isValid: false,
      error: 'Floor must be between 3 and 11'
    };
  }
  
  // Validate room range (01-10, which translates to 301-310, 401-410, etc.)
  if (room < 1 || room > 10) {
    return {
      floor,
      room,
      isValid: false,
      error: 'Room must be between 01 and 10 (e.g., 301, 302, ..., 310)'
    };
  }
  
  return {
    floor,
    room,
    isValid: true
  };
}

/**
 * Gets available classrooms for a specific floor
 * @param floor - Floor number (3-11)
 * @returns Array of valid classroom numbers
 */
export function getClassroomsForFloor(floor: number): number[] {
  if (floor < 3 || floor > 11) {
    return [];
  }
  
  return Array.from({ length: 10 }, (_, i) => floor * 100 + i + 1);
}

/**
 * Gets all valid classrooms (301-310, 401-410, ..., 1101-1110)
 * @returns Array of all valid classroom numbers
 */
export function getAllValidClassrooms(): number[] {
  const classrooms: number[] = [];
  for (let floor = 3; floor <= 11; floor++) {
    for (let room = 1; room <= 10; room++) {
      classrooms.push(floor * 100 + room);
    }
  }
  return classrooms;
}

/**
 * Formats classroom number for display
 * @param classroom - Classroom number
 * @returns Formatted string (e.g., "301 (Floor 3, Room 01)")
 */
export function formatClassroom(classroom: number): string {
  const validation = validateClassroom(classroom);
  if (!validation.isValid) {
    return classroom.toString();
  }
  
  return `${classroom} (Floor ${validation.floor}, Room ${validation.room.toString().padStart(2, '0')})`;
}

/**
 * Dynamic classroom suggestions based on input
 * @param input - User input
 * @param limit - Maximum number of suggestions
 * @returns Array of suggested classroom numbers
 */
export function getClassroomSuggestions(input: string, limit: number = 5): number[] {
  if (!input.trim()) {
    return getAllValidClassrooms().slice(0, limit);
  }
  
  const inputNum = parseInt(input);
  if (isNaN(inputNum)) {
    return [];
  }
  
  const allClassrooms = getAllValidClassrooms();
  
  // Exact match
  if (allClassrooms.includes(inputNum)) {
    return [inputNum];
  }
  
  // Prefix match
  const prefixMatches = allClassrooms.filter(room => 
    room.toString().startsWith(input)
  );
  
  if (prefixMatches.length > 0) {
    return prefixMatches.slice(0, limit);
  }
  
  // Floor match (if input is a floor number)
  const floor = Math.floor(inputNum / 100);
  if (floor >= 3 && floor <= 11) {
    return getClassroomsForFloor(floor).slice(0, limit);
  }
  
  return [];
}