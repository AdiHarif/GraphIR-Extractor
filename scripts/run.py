#!/usr/bin/env python3


import argparse
import shutil
import os
import subprocess
import sys
import re
import difflib


def parse_args():
    ap = argparse.ArgumentParser()

    ap.add_argument('-n', '--no-build', dest='build', action='store_false', default=True,
                    help='Skip build stage')
    ap.add_argument('-i', '--input', dest='input', nargs='+',
                    help='Run the analyzer on input file named <INPUT> (default: do not run anything)')
    ap.add_argument('-o', '--output', dest='output', default='graph.txt',
                    help='Save the graph inside file named <OUTPUT> (default: graph.txt)')
    ap.add_argument('-v', '--verbose', dest='verbose', action='store_true', default=False,
                    help='Print logs and output results')
    ap.add_argument('-c', '--clean', dest='clean', action='store_true', default=False,
                    help='Before building, remove build and output directories')

    args = ap.parse_args()

    return args


class Format:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    _END = '\033[0m'


class Log:
    _DEFAULT_EXIT_CODE = 1

    def __init__(self):
        self.info_prefix = 'INFO: '
        self.error_prefix = 'ERROR: '
        self.command_prefix = '>>'

    def info(self, msg, new_line=True, prefix=True, format=None):
        full_msg = (f'{self.info_prefix}{msg}') if prefix else msg
        if format is not None:
            full_msg = f'{"".join(format)}{full_msg}{Format._END}'
        print(full_msg, end='\n' if new_line else '')

    def error(self, msg, exit_code=_DEFAULT_EXIT_CODE):
        print(f'{Format.RED}{Format.BOLD}{self.error_prefix}{msg}{Format._END}')
        sys.exit(exit_code)

    def command(self, msg, cmd):
        self.info(msg)
        print(self.command_prefix, cmd)


class Paths:
    def __init__(self):
        self.scripts_dir = os.path.dirname(os.path.realpath(__file__))
        self.root_dir = os.path.dirname(self.scripts_dir)
        self.build_dir = os.path.join(self.root_dir, 'build')
        self.output_dir = os.path.join(self.root_dir, 'out')
        self.sources_dir = os.path.join(self.root_dir, 'sources')


class Config:
    def __init__(self, args):
        self.build = args.build
        self.input = args.input
        self.output = args.output
        self.verbose = args.verbose
        self.clean = args.clean
        self.paths = Paths()


class Stages:
    def __init__(self, args):
        self.cfg = Config(args)
        self.log = Log()

    def clean(self):
        if self.cfg.clean:
            dirs = [
                (self.cfg.paths.output_dir, 'out'),
                (self.cfg.paths.build_dir, 'build')
            ]
            for dir_path, dir_name in dirs:
                if self.cfg.verbose:
                    self.log.info(f'Removing {dir_name} directory')
                if os.path.isdir(dir_path):
                    try:
                        shutil.rmtree(dir_path)
                    except shutil.Error as e:
                        self.log.error(f'Failed to remove existing {dir_name} directory', e.errno)


    def build(self):
        if not self.cfg.build:
            if self.cfg.verbose:
                self.log.info('Skipping build stage')
            return

        build_cmd = 'tsc'

        if self.cfg.verbose:
            self.log.command('Running build command', build_cmd)

        try:
            subprocess.run(build_cmd, check=True)
        except subprocess.CalledProcessError as e:
            self.log.error('Build failed', e.returncode)
        else:
            if self.cfg.verbose:
                self.log.info('Build finished successfully', format=[Format.GREEN])

    def run(self):
        input_file = self.cfg.input

        if not input_file:
            if self.cfg.verbose:
                self.log.info('No samples or inputs were specified')
            return
        elif not os.path.isdir(self.cfg.paths.build_dir):
            self.log.error('Build directory does not exist')

        self._create_output_directory()

        run_cmd = self._get_run_command(input_file)

        if self.cfg.verbose:
            self.log.command('Running analyzer', ' '.join(run_cmd))

        try:
            subprocess.run(run_cmd, check=True)
        except subprocess.CalledProcessError as e:
            self.log.error('Analyzer failed', e.returncode)
        else:
            if self.cfg.verbose:
                self.log.info('Analyzer finished successfully', format=[Format.GREEN])
                self.log.info(f'Output path: {os.path.join(self.cfg.paths.output_dir, self.cfg.output)}', format=[Format.BOLD])

    def _get_run_command(self, input_files):
        node = 'node'
        entry_point_file = os.path.join(self.cfg.paths.build_dir, 'main.js')
        output_dir = self.cfg.paths.output_dir
        return [node, entry_point_file, output_dir] + input_files

    def _collect_sources(self):
        sources = []
        self._collect_sources_rec(self.cfg.paths.sources_dir, sources)
        return sources

    def _collect_sources_rec(self, dir_path, sources):
        for curr_name in os.listdir(dir_path):
            curr_path = os.path.join(dir_path, curr_name)
            if os.path.isfile(curr_path):
                sources.append(curr_path)
            elif os.path.isdir(curr_path):
                self._collect_sources_rec(curr_path)

    def _create_output_directory(self):
        if self.cfg.verbose:
            self.log.info('Creating output directory')
        try:
            os.makedirs(self.cfg.paths.output_dir, exist_ok=True)
        except OSError as e:
            self.log.error("Failed to create output directory", e.errno)

def main():
    args = parse_args()
    stages = Stages(args)
    stages.clean()
    stages.build()
    stages.run()


if __name__ == '__main__':
    main()
