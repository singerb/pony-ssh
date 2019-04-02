import logging
import os
import select
import struct
import sys
import time

from definitions import Opcode, ChangeType
from errors import CodedError
from libc import get_libc
from protocol import prepare_message_reader, send_change_notice, send_warning
from tools import vscode_glob_to_regexp

class Watcher:
    def __init__(self):
        self.libc = get_libc()
        self.inotify_fd = self.libc.inotify_init()
        if self.inotify_fd < 0:
            raise CodedError(self.inotify_fd, 'Failed to initiailize inotify')

        self.inotify_buffer = None
        self.watch_ids = {}
        self.watch_descriptors = {}
        self.message_reader = prepare_message_reader()

    def run(self):
        done = False
        while not done:
            ready = select.select([self.inotify_fd, sys.stdin], [], [])
            for stream in ready[0]:
                if stream == sys.stdin:
                    self.read_stdin()
                else:
                    self.read_notify()

    def read_stdin(self):
        [opcode, args] = next(self.message_reader)
        if opcode == Opcode.ADD_WATCH:
            self.add_watch(args['id'], os.path.expanduser(args['path']), args['recursive'], args['excludes'])
        elif opcode == Opcode.REMOVE_WATCH:
            self.rm_watch(args['id'])
        else:
            logging.warn('Invalid opcode received by watcher: ' + str(opcode))

    def find_paths(self, path, recursive, excludes):
        yield(path)
        if recursive and os.path.isdir(path):
            for name in os.listdir(path):
                child = os.path.join(path, name)
                is_dir = not os.path.islink(child) and os.path.isdir(child)
                if is_dir and name != '.pony-ssh' and not any(regex.match(child) for regex in excludes):
                    for child_path in self.find_paths(child, True, excludes):
                        yield child_path

    def add_watch(self, watch_id, path, recursive, excludes):
        if not os.path.exists(path):
            return

        self.watch_ids[watch_id] = []
        regex_excludes = map(vscode_glob_to_regexp, excludes)
        for watch_path in self.find_paths(path, recursive, regex_excludes):
            watch_wd = self.libc.inotify_add_watch(self.inotify_fd, watch_path, self.libc.IN_ALL_CHANGES)
            if watch_wd < 0:
                send_warning('Failed to watch ' + watch_path)
            else:
                self.watch_ids[watch_id].append(watch_wd)
                self.watch_descriptors[watch_wd] = (watch_id, path)

    def rm_watch(self, watch_id):
        if watch_id in self.watch_ids:
            for watch_wd in self.watch_ids[watch_id]:
                self.libc.inotify_rm_watch(watch_wd)
                if watch_wd in self.watch_descriptors:
                    del self.watch_descriptors[watch_wd]
            del self.watch_ids[watch_id]

    def process_change_type(self, watch_mask):
        if watch_mask & self.libc.IN_CREATED_CHANGES:
            return ChangeType.CREATED
        elif watch_mask & self.libc.IN_DELETED_CHANGES:
            return ChangeType.DELETED
        else:
            return ChangeType.CHANGED

    def read_notify(self):
        time.sleep(0.05) # Allow multiple close inotify messages to "bank up". Reduces noise.
        chunk = os.read(self.inotify_fd, 2048)
        self.inotify_buffer = chunk if self.inotify_buffer is None else self.inotify_buffer + chunk
        changes = {}
        while len(self.inotify_buffer) > self.libc.INOTIFY_HEADER_SIZE:
            raw_header = self.inotify_buffer[:self.libc.INOTIFY_HEADER_SIZE]
            header = struct.unpack(self.libc.INOTIFY_HEADER_FORMAT, raw_header)
            wd, watch_mask, _, name_length = header

            total_size = self.libc.INOTIFY_HEADER_SIZE + name_length
            if len(self.inotify_buffer) < total_size:
                break

            name = self.inotify_buffer[self.libc.INOTIFY_HEADER_SIZE:total_size].rstrip(b'\0')
            self.inotify_buffer = self.inotify_buffer[total_size:]

            if wd not in self.watch_descriptors:
                send_warning('Change to ' + name + ' found with an invalid watch descriptor: ' + str(wd))
                continue

            watch_id, watch_path = self.watch_descriptors[wd]
            full_path = os.path.join(watch_path, name)
            if watch_id not in changes:
                changes[watch_id] = {}

            if full_path not in changes[watch_id]:
                changes[watch_id][full_path] = watch_mask
            else:
                changes[watch_id][full_path] |= watch_mask

        # Convert inotify watch flags to created/changed/deleted flags
        changes = {
            watch_id: {
                path:self.process_change_type(watch_mask) for (path,watch_mask) in paths.items()
            } for (watch_id,paths) in changes.items()
        }

        send_change_notice(changes)
