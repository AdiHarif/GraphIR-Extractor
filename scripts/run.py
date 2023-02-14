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
    ap.add_argument('-s', '--sample', dest='samples', nargs='+',
                    help='Run the analyzer on sample with index <SAMPLE> (default: do not run anything)')
    ap.add_argument('-i', '--input', dest='inputs', nargs='+',
                    help='Run the analyzer on input file named <INPUT> (default: do not run anything)')
    ap.add_argument('-o', '--output', dest='output', default='graph.txt',
                    help='Save the graph inside file named <OUTPUT> (default: graph.txt)')
    ap.add_argument('-v', '--verbose', dest='verbose', action='store_true', default=False,
                    help='Print logs and output results')
    ap.add_argument('-c', '--clean', dest='clean', action='store_true', default=False,
                    help='Before building, remove build and output directories')
    ap.add_argument('-t', '--test', dest='test', action='store_true', default=False,
                    help=argparse.SUPPRESS)
    ap.add_argument('-u', '--update-goldens', dest='update_goldens', action='store_true', default=False,
                    help=argparse.SUPPRESS)

    args = ap.parse_args()

    if args.update_goldens:
        args.test = True

    if args.test:
        args.clean = True

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
        self.output_dir = os.path.join(self.root_dir, 'output')
        self.sources_dir = os.path.join(self.root_dir, 'sources')
        self.tests_dir = os.path.join(self.root_dir, 'tests')
        self.samples_dir = os.path.join(self.tests_dir, 'samples')
        self.goldens_dir = os.path.join(self.tests_dir, 'goldens')


class Config:
    def __init__(self, args):
        self.build = args.build
        self.samples = args.samples
        self.inputs = args.inputs
        self.output = args.output
        self.verbose = args.verbose
        self.clean = args.clean
        self.test = args.test
        self.update_goldens = args.update_goldens
        self.paths = Paths()


class Stages:
    def __init__(self, args):
        self.cfg = Config(args)
        self.log = Log()

    def clean(self):
        if self.cfg.clean:
            dirs = [
                (self.cfg.paths.output_dir, 'output'),
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
        if not self.cfg.build and not self.cfg.test:
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
        if self.cfg.test:
            self._test()
            return

        input_files = self._collect_inputs()

        if not input_files:
            if self.cfg.verbose:
                self.log.info('No samples or inputs were specified')
            return
        elif not os.path.isdir(self.cfg.paths.build_dir):
            self.log.error('Build directory does not exist')

        self._create_output_directory()

        run_cmd = self._get_run_command([input_file for _, input_file in input_files])

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

    def _test(self):
        any_failed = False
        any_updated = False

        samples = self._collect_samples()
        samples.sort(key=lambda sample: int(sample[0]))

        self._create_output_directory()

        for index, sample in samples:
            failed, updated = self._run_single_test(index, sample)

            any_failed = any_failed or failed
            any_updated = any_updated or updated

        self._print_test_results(any_updated, any_failed)

    def _run_single_test(self, index, sample):
        PASSED, FAILED, UPDATED, UNTOUCHED = 'PASSED', 'FAILED', 'UPDATED', 'UNTOUCHED'
        failed = False
        updated = False
        self.cfg.output = f'graph_{index}.txt'
        run_cmd = self._get_run_command([sample])

        if self.cfg.verbose:
            self.log.info(f'Running sample {index}', new_line=False)
        try:
            subprocess.run(run_cmd, check=True)
        except subprocess.CalledProcessError as e:
            failed = True
        else:
            if self.cfg.update_goldens:
                updated = self._update_golden(index)
            else:
                failed = self._is_diff(index)

        if not failed:
            os.remove(os.path.join(self.cfg.paths.output_dir, self.cfg.output))

        if self.cfg.verbose:
            if failed:
                self.log.info(f'\t\t{FAILED}', prefix=False, format=[Format.RED])
            if self.cfg.update_goldens:
                if updated:
                    self.log.info(f'\t\t{UPDATED}', prefix=False, format=[Format.YELLOW])
                else:
                    self.log.info(f'\t\t{UNTOUCHED}', prefix=False, format=[Format.GREEN])
            if not failed and not self.cfg.update_goldens:
                self.log.info(f'\t\t{PASSED}', prefix=False, format=[Format.GREEN])

        return failed, updated

    def _print_test_results(self, updated, failed):
        PASSED, FAILED, UPDATED, UNTOUCHED = 'PASSED', 'FAILED', 'UPDATED', 'UNTOUCHED'

        if self.cfg.update_goldens:
            if updated:
                result, format = UPDATED, [Format.YELLOW]
            else:
                result, format = UNTOUCHED, [Format.GREEN]
        else:
            if failed:
                result, format = FAILED, [Format.RED]
            else:
                result, format = PASSED, [Format.GREEN]
        format.append(Format.BOLD)

        self.log.info(f'Result: {result}', prefix=False, format=format)

    def _update_golden(self, index):
        output = os.path.join(self.cfg.paths.output_dir, self.cfg.output)
        golden = os.path.join(self.cfg.paths.goldens_dir, f'graph_{index}.txt')

        if self._is_diff(index):
            try:
                shutil.copy(output, golden)
            except shutil.Error as e:
                self.log.error(f'Failed to updated golden with index {index}', e.errno)
            return True
        return False

    def _is_diff(self, index):
        output = os.path.join(self.cfg.paths.output_dir, self.cfg.output)
        golden = os.path.join(self.cfg.paths.goldens_dir, f'graph_{index}.txt')

        with open(output, 'r') as output_file:
            output_lines = output_file.readlines()
        with open(golden, 'r') as golden_file:
            golden_lines = golden_file.readlines()

        for _ in difflib.unified_diff(output_lines, golden_lines,
                                         fromfile=output, tofile=golden,
                                         lineterm=''):
            return True

        return False

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

    def _collect_inputs(self):
        if self.cfg.verbose:
            self.log.info('Collecting input files')

        input_files = self._collect_samples()

        if self.cfg.inputs is not None:
            for input_file in self.cfg.inputs:
                input_path = os.path.realpath(input_file)
                if not os.path.isfile(input_path):
                    self.log.error(f'Input file {input_path} does not exist')
                input_files.append((None, input_path))

        return input_files

    def _collect_samples(self):
        samples = []

        if self.cfg.samples is not None:
            for sample_index in self.cfg.samples:
                if not sample_index.isdecimal():
                    self.log.error('All provided samples must be indexes')
                found = False
                for sample_name in os.listdir(self.cfg.paths.samples_dir):
                    sample_file = os.path.join(self.cfg.paths.samples_dir, sample_name)
                    if sample_name.startswith(f'sample_{sample_index}_'):
                        found = True
                        samples.append((sample_index, sample_file))
                        break
                if not found:
                    self.log.error(f'Sample with index {sample_index} does not exist')
        elif self.cfg.test:
            for sample_name in os.listdir(self.cfg.paths.samples_dir):
                [sample_index] = [sample[len('sample_'):] for sample in re.findall(r'sample_[0-9]+', sample_name)]
                sample_file = os.path.join(self.cfg.paths.samples_dir, sample_name)
                samples.append((sample_index, sample_file))

        return samples

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
