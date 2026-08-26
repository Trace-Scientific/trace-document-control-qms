import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceUrl = new URL("../deploy/aws/validation/service.yaml", import.meta.url);
const monitorUrl = new URL("../.github/workflows/overdue-review-monitor.yml", import.meta.url);

test("requires immutable release and us-west-1 resource identifiers", async () => {
  const template = await readFile(serviceUrl, "utf8");
  assert.match(template, /Image: !Sub \$\{ImageUri\}@\$\{ImageDigest\}/);
  assert.match(template, /AllowedPattern: "sha256:\[0-9a-f\]\{64\}"/);
  assert.match(template, /AllowedPattern: "\[0-9a-f\]\{40\}"/);
  assert.match(template, /acm:us-west-1/);
  assert.match(template, /secretsmanager:us-west-1/);
});

test("keeps two healthy private tasks and fails deployments safely", async () => {
  const template = await readFile(serviceUrl, "utf8");
  assert.match(template, /DesiredCount: 2/);
  assert.match(template, /MinCapacity: 2/);
  assert.match(template, /AssignPublicIp: DISABLED/);
  assert.match(template, /MinimumHealthyPercent: 100/);
  assert.match(template, /DeploymentCircuitBreaker: \{ Enable: true, Rollback: true \}/);
  assert.match(template, /HealthCheckPath: \/api\/health\/readiness/);
});

test("uses HTTPS, foundation runtime controls, and alarms", async () => {
  const template = await readFile(serviceUrl, "utf8");
  assert.match(template, /SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06/);
  assert.match(template, /ExecutionRoleArn: !Ref ApplicationExecutionRoleArn/);
  assert.match(template, /TaskRoleArn: !Ref ApplicationTaskRoleArn/);
  assert.match(template, /awslogs-group: !Ref ApplicationLogGroupName/);
  assert.match(template, /Cluster: !Ref ClusterName/);
  assert.doesNotMatch(template, /^  Cluster:\n    Type: AWS::ECS::Cluster/m);
  assert.doesNotMatch(template, /^  ApplicationLogGroup:\n    Type: AWS::Logs::LogGroup/m);
  assert.doesNotMatch(template, /^  ApplicationExecutionRole:\n    Type: AWS::IAM::Role/m);
  assert.match(template, /UnhealthyHostAlarm:/);
  assert.match(template, /LoadBalancer5xxAlarm:/);
  assert.doesNotMatch(template, /postgresql:\/\//);
});

test("skips scheduled overdue monitoring until explicitly enabled", async () => {
  const workflow = await readFile(monitorUrl, "utf8");
  assert.match(
    workflow,
    /if: github\.event_name == 'workflow_dispatch' \|\| vars\.MONITOR_ENABLED == 'true'/,
  );
});
